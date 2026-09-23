import { logger, LogLevel } from "../lib/logger.ts";
import { loadParams, paramsPathFromArgs, noParamsFileMessage, ParamsError, Params, dbFile } from "../lib/params.ts";
import { scanImages } from "../lib/scanner.ts";
import { openDb, queryImages, insertAction, insertNote, hasMissingNote, fileExists, getImageInfo, DbImage } from "../dbase/db.ts";
import { DatabaseSync } from "node:sqlite";

const PORT = 8000;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

// Extensions an <img> tag can actually render. Deliberately wider than
// scanner.ts's IMAGE_EXTENSIONS: bmp/svg display fine but aren't collected in
// folder mode. Anything outside this set (.avi, .mp4, .nef, .psd, ...) is
// reported as displayable:false so the frontend shows its path instead of
// handing the browser a file it can't decode.
const DISPLAYABLE_EXTENSIONS = new Set(
  [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"],
);

function canDisplay(name: string): boolean {
  return DISPLAYABLE_EXTENSIONS.has(name.substring(name.lastIndexOf(".")).toLowerCase());
}

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

async function serveFile(path: string): Promise<Response> {
  try {
    const file = await Deno.readFile(path);
    return new Response(file, {
      headers: {
        "Content-Type": getMimeType(path),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    logger.error(`Error serving file ${path}: ${error}`);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Load images from folder source — returns relative paths (same as before)
async function loadFolderImages(params: Params): Promise<{ imagePaths: string[], dbImages: null }> {
  const images = await scanImages(params);
  const imagePaths = images.map((img) =>
    img.replace(params.imageFolderPath, "").replace(/^\//, "")
  );
  return { imagePaths, dbImages: null };
}

// Result type for DB loading
interface DbLoadResult {
  dbImages: DbImage[];
  db: DatabaseSync | null;
  error: string | null;
  totalFromDb: number;
}

// Load images from DB source — returns DbImage[] with ids and absolute paths.
// Does not check the filesystem: missing-file detection happens lazily, per
// image, when it's requested for display (see /api/imageInfo below).
function loadDbImages(params: Params): DbLoadResult {
  try {
    // queryImages opens its own read-only connection from the path; this
    // handle stays writable for the notes/actions inserts that follow.
    const db = openDb(dbFile(params));
    const result = queryImages(dbFile(params), params.whereClause, params.maxFiles, params.orderBy);
    return {
      dbImages: result.images,
      db,
      error: null,
      totalFromDb: result.totalFromDb,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to load database: ${message}`);
    return {
      dbImages: [],
      db: null,
      error: message,
      totalFromDb: 0,
    };
  }
}

async function main(): Promise<void> {
  logger.info("Starting slideshow server...");

  // The file this run is bound to. Everything that reads or writes params
  // uses this one path, so saving from the Control Panel cannot land in the
  // other mode's file.
  const paramsFile = paramsPathFromArgs();
  if (!paramsFile) {
    logger.error(noParamsFileMessage());
    Deno.exit(1);
  }
  const params = await loadParams(paramsFile);
  logger.setLogLevel(params.logLevel);
  logger.info(`Params file: ${paramsFile} (source=${params.source})`);

  // Load images based on source
  let folderImagePaths: string[] = [];
  let dbImages: DbImage[] = [];
  let db: DatabaseSync | null = null;
  let startupError: string | null = null;
  let dbTotalFromDb = 0;
  const isDbSource = params.source === "db";

  if (isDbSource) {
    const result = loadDbImages(params);
    dbImages = result.dbImages;
    db = result.db;
    startupError = result.error;
    dbTotalFromDb = result.totalFromDb;
    if (result.error) {
      logger.error(`DB source failed: ${result.error}`);
    } else {
      logger.info(`DB source: ${dbImages.length} images loaded`);
    }
  } else {
    const result = await loadFolderImages(params);
    folderImagePaths = result.imagePaths;
    logger.info(`Folder source: ${folderImagePaths.length} images loaded`);
  }

  // Logged from onListen, not before: the bind can still fail (port in use),
  // and "Server starting" followed by an error read as if it had started.
  const onListen = () => logger.info(`Server listening on http://localhost:${PORT}`);

  Deno.serve({ port: PORT, onListen }, async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    logger.debug(`${request.method} ${pathname}`);

    // Route: GET / or /slides - Serve slides.html (slideshow viewer)
    if (pathname === "/" || pathname === "/slides" || pathname === "/slides.html") {
      return serveFile("./static/slides.html");
    }

    // Route: GET /params - Serve params.html (params page)
    if (pathname === "/params" || pathname === "/params.html") {
      return serveFile("./static/params.html");
    }

    // Route: GET /static/* - Serve static files
    if (pathname.startsWith("/static/")) {
      const filePath = "." + pathname;
      return serveFile(filePath);
    }

    // Route: GET /api/params - Return current parameters
    if (pathname === "/api/params" && request.method === "GET") {
      return jsonResponse({
        paramsFile,
        source: params.source,
        imageFolderPath: params.imageFolderPath,
        dataDir: params.dataDir,
        dbName: params.dbName,
        trashDir: params.trashDir,
        whereClause: params.whereClause,
        orderBy: params.orderBy,
        displayTimeMs: params.displayTimeMs,
        maxDepth: params.maxDepth,
        maxFiles: params.maxFiles,
        logLevel: logger.getLogLevel(),
      });
    }

    // Route: POST /api/params - Save editable params
    // Requires server restart to take effect.
    if (pathname === "/api/params" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = await Deno.readTextFile(paramsFile);
        const current = JSON.parse(text);

        // Update fields from the form. `source` is deliberately not editable:
        // it is what ties this file to the app that may use it, and you choose
        // it by starting with --params=<file>, not by typing here.
        if (body.dataDir !== undefined) current.dataDir = body.dataDir;
        if (body.dbName !== undefined) current.dbName = body.dbName;
        if (body.trashDir !== undefined) current.trashDir = body.trashDir;
        if (body.dataDir !== undefined || body.dbName !== undefined) delete current.dbPath;
        if (body.whereClause !== undefined) current.whereClause = body.whereClause;
        if (body.orderBy !== undefined) current.orderBy = body.orderBy;
        if (body.imageFolderPath !== undefined) current.imageFolderPath = body.imageFolderPath;
        if (body.maxDepth !== undefined) current.maxDepth = body.maxDepth;
        if (body.maxFiles !== undefined) current.maxFiles = body.maxFiles;

        await Deno.writeTextFile(paramsFile, JSON.stringify(current, null, 2) + "\n");
        logger.info(`Params saved to ${paramsFile} (source=${current.source})`);
        return jsonResponse({ ok: true, message: "Saved. Restart server to apply changes." });
      } catch (error) {
        logger.error(`Failed to save params: ${error}`);
        return jsonResponse({ error: "Failed to save params" }, 500);
      }
    }

    // Route: POST /api/logLevel - Change log level at runtime
    if (pathname === "/api/logLevel" && request.method === "POST") {
      const VALID_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
      try {
        const body = await request.json();
        const level = body.logLevel as LogLevel;
        if (!VALID_LEVELS.includes(level)) {
          return jsonResponse({ error: "Invalid log level" }, 400);
        }
        logger.setLogLevel(level);
        logger.info(`Log level changed to ${level}`);
        return jsonResponse({ logLevel: level });
      } catch {
        return jsonResponse({ error: "Invalid request body" }, 400);
      }
    }

    // Route: GET /api/images - Return image list
    if (pathname === "/api/images") {
      if (isDbSource) {
        // DB mode: return list of {id, index} so frontend can reference by index
        // Images served via /images/<index> which maps to dbImages[index]
        const imageList = dbImages.map((_img, i) => String(i));

        // Build error/warning info for frontend
        let errorInfo: { error: string; suggestion: string } | null = null;
        if (startupError) {
          // Database error (invalid path or SQL error)
          if (startupError.includes("unable to open database")) {
            errorInfo = {
              error: `Cannot open database: ${dbFile(params)}`,
              suggestion: `Check that dataDir and dbName in ${paramsFile} point to a valid SQLite file.`,
            };
          } else if (startupError.includes("syntax error")) {
            errorInfo = {
              error: `SQL syntax error in WHERE or ORDER BY clause`,
              suggestion: `Fix the whereClause ("${params.whereClause}") or orderBy ("${params.orderBy}") in ${paramsFile}.`,
            };
          } else {
            errorInfo = {
              error: startupError,
              suggestion: `Check the settings in ${paramsFile} and restart the server.`,
            };
          }
        } else if (imageList.length === 0 && dbTotalFromDb === 0) {
          // Empty query result
          errorInfo = {
            error: "No images match the WHERE clause",
            suggestion: `Adjust the whereClause in ${paramsFile}. Current: "${params.whereClause || "(none)"}"`,
          };
        }

        return jsonResponse({
          source: "db",
          images: imageList,
          displayTimeMs: params.displayTimeMs,
          paramsFile,
          errorInfo,
        });
      } else {
        // Folder mode: same as before
        const folderParam = url.searchParams.get("folder");
        let filteredImages = folderImagePaths;

        if (folderParam) {
          const normalizedFolder = folderParam.replace(/^\/+|\/+$/g, "");
          filteredImages = folderImagePaths.filter((img) =>
            img.startsWith(normalizedFolder + "/") || img.startsWith(normalizedFolder)
          );
        }

        return jsonResponse({
          source: "folder",
          images: filteredImages,
          displayTimeMs: params.displayTimeMs,
          paramsFile,
        });
      }
    }

    // Route: GET /api/imageInfo/<index> - Return metadata for current image (DB mode)
    //
    // Also the lazy missing-file detection point: this is fetched for every
    // image before the frontend loads it, so it's checked here rather than
    // in /images/* below. On a marker-free first miss, records one 'missing'
    // note (see docs/reconcile.md) and reports `missing: true` so the
    // frontend can skip loading the file rather than triggering a broken-
    // image error. Never touches `fotos` or `actions` — reconciling a
    // 'missing' note into a real deletion is a separate, owner-driven step.
    if (isDbSource && pathname.startsWith("/api/imageInfo/")) {
      const index = parseInt(pathname.replace("/api/imageInfo/", ""));
      if (isNaN(index) || index < 0 || index >= dbImages.length) {
        return jsonResponse({ error: "Invalid image index" }, 400);
      }
      const img = dbImages[index];
      const missing = !fileExists(img.fullPath);
      if (missing) {
        logger.warn(`Missing file for img_id=${img.id}: ${img.fullPath}`);
        if (db && !hasMissingNote(db, img.id)) {
          insertNote(db, img.id, "missing", 5, `File not found: ${img.fullPath}`);
        }
      }
      // Videos and raw/editor formats are in `fotos` too; flag them here (the
      // same place missing files are flagged) so the WARN lands in
      // slideshow.log with the img_id and path the frontend will display.
      const displayable = canDisplay(img.name);
      if (!missing && !displayable) {
        logger.warn(`Cannot display img_id=${img.id}: ${img.fullPath}`);
      }
      const info = db ? getImageInfo(db, img.id) : null;
      return jsonResponse({
        id: img.id,
        name: img.name,
        path: img.fullPath,
        dtTaken: info?.dtTaken || null,
        dtCreated: info?.dtCreated || null,
        bytes: info?.bytes ?? null,
        imgSize: info?.imgSize || null,
        camera: info?.camera || null,
        md5: info?.md5 || null,
        duration: info?.duration || null,
        missing,
        displayable,
      });
    }

    // Route: POST /api/actions - Record an action on an image (DB mode)
    if (isDbSource && pathname === "/api/actions" && request.method === "POST") {
      if (!db) {
        return jsonResponse({ error: "Database not available" }, 500);
      }
      try {
        const body = await request.json();
        const { fotoId, act } = body;
        if (typeof fotoId !== "number" || typeof act !== "string") {
          return jsonResponse({ error: "fotoId (number) and act (string) required" }, 400);
        }
        // Look up the path from fotoId for logging
        const img = dbImages.find((i) => i.id === fotoId);
        const path = img?.fullPath;
        insertAction(db, fotoId, act, path);
        return jsonResponse({ ok: true });
      } catch {
        return jsonResponse({ error: "Invalid request body" }, 400);
      }
    }

    // Route: POST /api/notes - Record a note on an image (DB mode)
    if (isDbSource && pathname === "/api/notes" && request.method === "POST") {
      if (!db) {
        return jsonResponse({ error: "Database not available" }, 500);
      }
      try {
        const body = await request.json();
        const { fotoId, category, rank, comment } = body;
        if (typeof fotoId !== "number") {
          return jsonResponse({ error: "fotoId (number) required" }, 400);
        }
        insertNote(db, fotoId, category || null, typeof rank === "number" ? rank : null, comment || null);
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to save note: ${message}`);
        return jsonResponse({ error: "Failed to save note: " + message }, 500);
      }
    }

    // Route: GET /images/* - Serve actual image files
    if (pathname.startsWith("/images/")) {
      if (isDbSource) {
        // DB mode: /images/<index> maps to dbImages[index].fullPath
        const index = parseInt(pathname.replace("/images/", ""));
        if (isNaN(index) || index < 0 || index >= dbImages.length) {
          return new Response("Not Found", { status: 404 });
        }
        return serveFile(dbImages[index].fullPath);
      } else {
        // Folder mode: /images/<relative-path> under imageFolderPath
        const relativePath = pathname.replace("/images/", "");
        const fullPath = `${params.imageFolderPath}/${relativePath}`;
        return serveFile(fullPath);
      }
    }

    return new Response("Not Found", { status: 404 });
  });
}

main().catch((error) => {
  // Exit 1 on a bad start rather than running on half-loaded settings.
  // A ParamsError has already said its piece; anything else has not.
  if (error instanceof Deno.errors.AddrInUse) {
    // Easy to hit: a server left running in another terminal still holds the
    // port. Say that instead of dumping the listen stack.
    logger.error(`Port ${PORT} is already in use — is another slideshow server running?`);
  } else if (!(error instanceof ParamsError)) {
    console.error(error);
  }
  Deno.exit(1);
});

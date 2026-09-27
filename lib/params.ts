import { logger, LogLevel } from "./logger.ts";

// A params problem that has already been logged and explained. Entry points
// exit on it quietly rather than printing the same line a second time.
export class ParamsError extends Error {}

export interface Params {
  imageFolderPath: string;
  dataDir: string;
  dbName: string;
  trashDir: string;
  whereClause: string;
  orderBy: string;
  displayTimeMs: number;
  maxFiles: number;
  logLevel: LogLevel;
}

const DEFAULT_PARAMS: Params = {
  // No default: an invented path just moves the failure somewhere less obvious.
  imageFolderPath: "",
  dataDir: "../photos",
  dbName: "photos3.db",
  trashDir: "../photos/trash",
  whereClause: "",
  orderBy: "",
  displayTimeMs: 5000,
  maxFiles: 200,
  logLevel: "INFO",
};

// Full path to the SQLite file. Relative dataDir resolves from the project root.
export function dbFile(params: Params): string {
  return `${params.dataDir.replace(/\/+$/, "")}/${params.dbName}`;
}

export async function loadParams(paramsPath: string): Promise<Params> {
  try {
    const text = await Deno.readTextFile(paramsPath);
    const parsed = JSON.parse(text);

    const params: Params = {
      imageFolderPath: parsed.imageFolderPath ?? DEFAULT_PARAMS.imageFolderPath,
      dataDir: parsed.dataDir ?? DEFAULT_PARAMS.dataDir,
      dbName: parsed.dbName ?? DEFAULT_PARAMS.dbName,
      trashDir: parsed.trashDir ?? "",
      whereClause: parsed.whereClause ?? DEFAULT_PARAMS.whereClause,
      orderBy: parsed.orderBy ?? DEFAULT_PARAMS.orderBy,
      displayTimeMs: parsed.displayTimeMs ?? DEFAULT_PARAMS.displayTimeMs,
      maxFiles: parsed.maxFiles ?? DEFAULT_PARAMS.maxFiles,
      logLevel: parsed.logLevel ?? DEFAULT_PARAMS.logLevel,
    };

    // dbPath (full path to the db file) was replaced by dataDir + dbName.
    // Split an old value rather than silently misreading it as a folder.
    if (parsed.dbPath !== undefined && parsed.dataDir === undefined && parsed.dbName === undefined) {
      const slash = String(parsed.dbPath).lastIndexOf("/");
      params.dataDir = slash >= 0 ? parsed.dbPath.slice(0, slash) : ".";
      params.dbName = parsed.dbPath.slice(slash + 1);
      logger.warn(`${paramsPath}: "dbPath" is obsolete — using dataDir="${params.dataDir}", dbName="${params.dbName}". Replace it with those two keys.`);
    } else if (parsed.dbPath !== undefined) {
      logger.warn(`${paramsPath}: obsolete "dbPath" ignored — dataDir/dbName are used instead.`);
    }
    if (!params.trashDir) params.trashDir = `${params.dataDir}/trash`;

    // Validate params
    for (const key of ["dataDir", "dbName", "trashDir"] as const) {
      if (typeof params[key] !== "string" || params[key].length === 0) {
        throw new Error(`${key} must be a non-empty string`);
      }
    }
    if (params.dbName.includes("/")) {
      throw new Error("dbName must be a file name only — put the folder in dataDir");
    }
    if (typeof params.displayTimeMs !== "number" || params.displayTimeMs < 100) {
      throw new Error("displayTimeMs must be a number >= 100");
    }
    if (typeof params.maxFiles !== "number" || params.maxFiles < 1) {
      throw new Error("maxFiles must be a number >= 1");
    }

    logger.debug(`Params loaded: db=${dbFile(params)}, trashDir=${params.trashDir}`);
    return params;
  } catch (error) {
    // A missing file is fatal, not a warning. Falling back to DEFAULT_PARAMS
    // only ever produced a server pointed at a folder that does not exist on
    // this machine, several lines after the real problem — worse still once
    // --params made a typo in the file name possible.
    if (error instanceof Deno.errors.NotFound) {
      const message = `Params file not found: ${paramsPath}`;
      logger.error(message);
      throw new ParamsError(message);
    }
    logger.error(`Failed to load params from ${paramsPath}: ${error}`);
    throw new ParamsError(`Failed to load params from ${paramsPath}: ${error}`);
  }
}

// Which params file this run uses: `--params=<file>` or `--params <file>`,
// or null when the flag was not given. Every entry point (server and recon
// scripts) picks its settings the same way, so one mode's file can never be
// read — or written back — by a program started for the other.
//
// There is deliberately no default. A default is a guess about which mode you
// meant, and the file it named (params.json) no longer exists now that the
// settings are split per mode — so the guess produced a "file not found" that
// read like the flag had never been wired up.
export function paramsPathFromArgs(args: string[] = Deno.args): string | null {
  const inline = args.find((a) => a.startsWith("--params="));
  if (inline) return inline.slice("--params=".length);
  const i = args.indexOf("--params");
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return null;
}

// The one message every entry point prints when --params is missing. Lists the
// params files actually sitting in the project root rather than a hardcoded
// pair, so it stays right when a third one appears.
export function noParamsFileMessage(dir = "."): string {
  let available: string[] = [];
  try {
    available = [...Deno.readDirSync(dir)]
      .filter((e) => e.isFile && /^params.*\.json$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    // Unreadable directory: the advice below is still the useful part.
  }
  const list = available.length ? available.join(", ") : "(none found in this folder)";
  return `No params file given. Use --params=<file>\n       Available: ${list}`;
}


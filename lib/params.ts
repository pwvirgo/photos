import { logger, LogLevel } from "./logger.ts";

// A params problem that has already been logged and explained. Entry points
// exit on it quietly rather than printing the same line a second time.
export class ParamsError extends Error {}

export interface Params {
  // From the shared file (SHARED_PARAMS_FILE) — the same for every module.
  dbDir: string;
  dbName: string;
  trashDir: string;
  // From the module's own file (--params).
  whereClause: string;
  orderBy: string;
  displayTimeMs: number;
  maxFiles: number;
  logLevel: LogLevel;
}

// Where the database lives is one fact, so it is in one file at the project
// root, not repeated in each module's params file — two copies had already
// drifted apart. Located from this source file, so it is found whatever the
// current directory is. The values inside it are not: a relative dbDir or
// trashDir still resolves from the current directory, which works because
// every module is run from its own folder one level below the root.
export const SHARED_PARAMS_FILE = new URL("../params_shared.json", import.meta.url).pathname;

// Keys that belong in SHARED_PARAMS_FILE. Found in a module file they are
// ignored, with a warning, so a stale copy can never quietly win.
const SHARED_KEYS = ["dbDir", "dbName", "trashDir", "dataDir", "dbPath"];

const DEFAULT_PARAMS = {
  whereClause: "",
  orderBy: "",
  displayTimeMs: 5000,
  maxFiles: 200,
  logLevel: "INFO" as LogLevel,
};

// Full path to the SQLite file. A relative dbDir resolves from the current
// directory.
export function dbFile(params: Params): string {
  return `${params.dbDir.replace(/\/+$/, "")}/${params.dbName}`;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch (error) {
    // A missing file is fatal, not a warning. Falling back to defaults only
    // ever produced a program pointed at a folder that does not exist on
    // this machine, several lines after the real problem.
    const message = error instanceof Deno.errors.NotFound
      ? `Params file not found: ${path}`
      : `Failed to load params from ${path}: ${error}`;
    logger.error(message);
    throw new ParamsError(message);
  }
}

export async function loadParams(paramsPath: string): Promise<Params> {
  const shared = await readJson(SHARED_PARAMS_FILE);
  const parsed = await readJson(paramsPath);
  try {
    if (shared.dataDir !== undefined) {
      throw new Error(`"dataDir" was renamed to "dbDir" — rename it in ${SHARED_PARAMS_FILE}`);
    }
    for (const key of SHARED_KEYS) {
      if (parsed[key] !== undefined) {
        logger.warn(`${paramsPath}: "${key}" ignored — the database location comes from ${SHARED_PARAMS_FILE}. Remove it.`);
      }
    }

    const params = {
      dbDir: shared.dbDir,
      dbName: shared.dbName,
      trashDir: shared.trashDir ?? `${shared.dbDir}/trash`,
      whereClause: parsed.whereClause ?? DEFAULT_PARAMS.whereClause,
      orderBy: parsed.orderBy ?? DEFAULT_PARAMS.orderBy,
      displayTimeMs: parsed.displayTimeMs ?? DEFAULT_PARAMS.displayTimeMs,
      maxFiles: parsed.maxFiles ?? DEFAULT_PARAMS.maxFiles,
      logLevel: parsed.logLevel ?? DEFAULT_PARAMS.logLevel,
    } as Params;

    // Validate params
    for (const key of ["dbDir", "dbName", "trashDir"] as const) {
      if (typeof params[key] !== "string" || params[key].length === 0) {
        throw new Error(`${key} must be a non-empty string in ${SHARED_PARAMS_FILE}`);
      }
    }
    if (params.dbName.includes("/")) {
      throw new Error("dbName must be a file name only — put the folder in dbDir");
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
    const message = `Bad params: ${error instanceof Error ? error.message : error}`;
    logger.error(message);
    throw new ParamsError(message);
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


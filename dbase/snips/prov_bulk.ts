// dbase/snips/prov_bulk.ts
// Create or update prov rows for many photos at once: every photo that
// matches a whereClause gets the column values in a params file.
// Replaces the one-off prov_populate.ts / prov_folder_sequence.sql.
//
//   cd dbase
//   deno run --allow-read --allow-write snips/prov_bulk.ts \
//       --params=snips/prov_bulk_params.json [--execute] [--limit N]
//
// Dry run unless --execute. A dry run does the real writes inside a
// transaction and then rolls them back, so it runs saveProv()'s checks (bad
// rank, etc.) and reports exactly what --execute would do.
// --limit N: only the first N photos (in orderBy order), for a trial run.
//
// Params file (see prov_bulk_params.json; keys starting "comment" are ignored):
//   whereClause  required. Same syntax as slideshow's whereClause: a condition
//                on fotos columns. Deleted photos are never matched.
//   orderBy      order of the photos (for the list, and for --limit).
//                Default: path, name.
//   existing     what to do with a photo that already has a prov row:
//                  skip      leave it alone (default)
//                  fill      write only the columns that are blank in it
//                  overwrite write every column listed in set
//   set          prov columns to write. Only the columns listed are touched:
//                leave one out and it keeps its value. "" or null clears it
//                (with overwrite). Every photo gets the same values.
//
// The database comes from params_shared.json, like every module.

import {
  getProv,
  openDb,
  PROV_RANK_FIELDS,
  PROV_TEXT_FIELDS,
  type ProvRow,
  queryImages,
  saveProv,
} from "../db.ts";
import { dbFile, loadParams, paramsPathFromArgs } from "../../lib/params.ts";
import { logger, setLogLevel } from "../../lib/logger.ts";

const PROV_FIELDS: string[] = [...PROV_TEXT_FIELDS, ...PROV_RANK_FIELDS];
const EXISTING = ["skip", "fill", "overwrite"];
const TOP_KEYS = ["whereClause", "orderBy", "existing", "set"];

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

function argValue(name: string): string | undefined {
  const inline = Deno.args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = Deno.args.indexOf(name);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

// "" / null / whitespace all mean blank, as in saveProv().
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function same(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  return norm(a) === norm(b);
}

// ---- read and check the params file ---------------------------------------

const paramsPath = paramsPathFromArgs();
if (!paramsPath) fail("usage: prov_bulk.ts --params=<file> [--execute] [--limit N]");
const execute = Deno.args.includes("--execute");
const limitArg = argValue("--limit");
const limit = limitArg === undefined ? Infinity : Number(limitArg);
if (!(limit > 0)) fail("--limit must be a positive number");

let p: Record<string, unknown>;
try {
  p = JSON.parse(await Deno.readTextFile(paramsPath));
} catch (err) {
  fail(`Cannot read ${paramsPath}: ${err instanceof Error ? err.message : err}`);
}

for (const key of Object.keys(p)) {
  if (!TOP_KEYS.includes(key) && !key.startsWith("comment")) {
    fail(`${paramsPath}: unknown key "${key}" (expected ${TOP_KEYS.join(", ")})`);
  }
}
const whereClause = typeof p.whereClause === "string" ? p.whereClause.trim() : "";
if (whereClause === "") {
  fail(`${paramsPath}: whereClause is required — an empty one would match every photo`);
}
const orderBy = typeof p.orderBy === "string" && p.orderBy.trim() !== ""
  ? p.orderBy
  : "path, name";
const existing = p.existing === undefined ? "skip" : p.existing;
if (typeof existing !== "string" || !EXISTING.includes(existing)) {
  fail(`${paramsPath}: existing must be one of ${EXISTING.join(", ")}`);
}
if (typeof p.set !== "object" || p.set === null || Array.isArray(p.set)) {
  fail(`${paramsPath}: set must be an object of prov columns`);
}
const set = p.set as Record<string, unknown>;
for (const key of Object.keys(set)) {
  if (!PROV_FIELDS.includes(key)) {
    fail(`${paramsPath}: set.${key} is not a prov column (columns: ${PROV_FIELDS.join(", ")})`);
  }
}
if (Object.keys(set).length === 0) fail(`${paramsPath}: set lists no columns`);

// ---- select the photos -----------------------------------------------------

const params = await loadParams();
const dbPath = dbFile(params);
const result = queryImages(dbPath, whereClause, Number.MAX_SAFE_INTEGER, orderBy);
const all = result.images; // every matching photo: [{ id, fullPath, name }, ...]
if (all.length === 0) fail(`No photos match: ${whereClause}`);
const photos = all.slice(0, limit);

console.log(`=== prov_bulk.ts — ${execute ? "EXECUTING" : "DRY RUN"} ===`);
console.log(`db:       ${dbPath}`);
console.log(`where:    ${whereClause}`);
console.log(`order by: ${orderBy}`);
console.log(`existing: ${existing}`);
console.log(`set:      ${Object.keys(set).join(", ")}`);
console.log(`photos:   ${all.length} match${photos.length < all.length ? `, first ${photos.length} (--limit)` : ""}`);
console.log("");

// ---- write (or rehearse) ---------------------------------------------------

const counts: Record<string, number> = {};
const tally = (what: string) => (counts[what] = (counts[what] ?? 0) + 1);

setLogLevel("WARN"); // openDb()/saveProv() log every call; this script prints its own list
const db = openDb(dbPath);
db.exec("BEGIN");
try {
  for (const photo of photos) {
    const values = set; // the same values for every photo
    const old: ProvRow | null = getProv(db, photo.id);
    let what: string;
    let row: Record<string, unknown>;
    let changed = ""; // for an update: which columns change
    if (!old) {
      what = "new";
      row = values;
    } else if (existing === "skip") {
      what = "skip (has prov)";
      row = {};
    } else {
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        const current = (old as unknown as Record<string, unknown>)[k];
        if (existing === "fill" && !isBlank(current)) continue;
        if (!same(current, v)) changes[k] = v;
      }
      what = Object.keys(changes).length ? "update" : "unchanged";
      changed = Object.keys(changes).length ? `  [${Object.keys(changes).join(", ")}]` : "";
      row = { ...old, ...changes };
    }

    if (what === "new" || what === "update") {
      try {
        if (saveProv(db, photo.id, row) === "deleted") {
          what = what === "new" ? "nothing to write (all blank)" : "deleted (all blank)";
        }
      } catch (err) {
        throw new Error(`img_id ${photo.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    tally(what);
    const title = "title" in set ? `  "${row.title ?? old?.title ?? ""}"` : "";
    console.log(`  ${what.padEnd(16)}  img_id ${String(photo.id).padEnd(6)}  ${photo.name}${title}${changed}`);
  }
  db.exec(execute ? "COMMIT" : "ROLLBACK");
} catch (err) {
  db.exec("ROLLBACK");
  db.close();
  fail(`Nothing written. ${err instanceof Error ? err.message : err}`);
}
db.close();
setLogLevel(params.logLevel);

const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
console.log("");
console.log(`${execute ? "Done" : "Dry run — nothing written"}: ${summary}`);
if (execute) {
  logger.info(`prov_bulk.ts ${paramsPath}: ${summary} (where ${whereClause})`);
} else {
  console.log("Run again with --execute to write (try --limit 1 first).");
}

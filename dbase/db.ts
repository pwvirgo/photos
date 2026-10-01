import { DatabaseSync } from "node:sqlite";
import { logger } from "../lib/logger.ts";

export interface FotoRow {
  img_id: number;
  path: string;
  name: string;
  bytes: number;
  dt_taken: string | null;
  dt_created: string | null;
  camera: string | null;
  lens: string | null;
  lat: number | null;
  lon: number | null;
  img_size: string | null;
  duration: string | null;
  md5: string | null;
}

// Image entry returned to the server — includes DB id for actions
export interface DbImage {
  id: number;
  fullPath: string;
  name: string;
}

// Sanity-check a SQL fragment from the params file. This is NOT what stops a fragment
// modifying the database — queryImages() runs it on a read-only connection
// (openDbReadOnly), so SQLite itself refuses any write. Do not re-add a
// keyword blacklist here: it used to reject `insert/update/delete/drop/alter/
// create` as words, which also rejected legitimate read-only fragments whose
// data contains one, e.g. `category='delete'` or `path LIKE '%to delete%'`.
//
// What remains is a usability guard. prepare() compiles only the first
// statement and silently discards the rest, so a fragment containing ';' would
// lose everything after it with no complaint — better to say so.
function checkSqlFragment(clause: string, label: string): void {
  if (clause.trim() === "") return;
  if (clause.includes(";")) {
    throw new Error(`${label} must be a single expression — remove the ';'`);
  }
}

export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  // node:sqlite enforces foreign keys by default (unlike the sqlite3 CLI, which
  // is off by default). notes/actions keep img_id referencing fotos rows as an
  // audit trail that must outlive the photo. Under the current approach
  // (fotos.status='deleted') the row stays put, so nothing is orphaned today —
  // `PRAGMA foreign_key_check` is clean. It is kept off for what comes next: a
  // purge of status='deleted' rows would otherwise be blocked by, or cascade away,
  // that audit trail. (An older scheme moved rows to a `deleted` table, which
  // orphaned notes outright; that table is gone.)
  db.exec("PRAGMA foreign_keys = OFF;");
  logger.info(`Opened database: ${dbPath}`);
  return db;
}

// Read-only handle, used for queries built from params-file fragments. SQLite
// refuses every write on this connection ("attempt to write a readonly
// database"), which is the real guard around hand-written SQL. No foreign_keys
// pragma: that setting only affects writes.
//
// Unlike openDb(), this does not create the file if it is missing — a bad
// dataDir/dbName fails loudly here instead of yielding an empty database.
export function openDbReadOnly(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  logger.debug(`Opened database read-only: ${dbPath}`);
  return db;
}

export function fileExists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

export interface QueryResult {
  images: DbImage[];
  totalFromDb: number;
}

// Queries the fotos table only — does not touch the filesystem or mutate
// catalog state. Missing-file detection is lazy, per image, when it's actually
// requested for display (slideshow.ts /api/imageInfo), or in bulk via
// recon/findMissing.ts — never here. See docs/reconcile.md.
//
// Takes the db *path*, not a handle, and opens its own read-only connection for
// the duration of the query: the whereClause/orderBy fragments come from
// the params file, and this way there is no writable handle for a caller to pass in
// by mistake. The caller keeps its own openDb() handle for notes/actions.
export function queryImages(dbPath: string, whereClause: string,
   maxFiles: number, orderBy = ""): QueryResult {

  checkSqlFragment(whereClause, "WHERE clause");
  checkSqlFragment(orderBy, "ORDER BY clause");

  // `status='deleted'` rows are treated as if they
  // were gone from the table (this replaced an older scheme that physically
  // moved rows into a separate `deleted` table). A CTE named `fotos` shadows
  // the real table for the entire query, so the params whereClause — and
  // any self-reference it makes, e.g. a correlated `FROM fotos b` for md5
  // dedup — only ever sees live rows, and needs no `status` filter of its own.
  const where = whereClause.trim() === "" ? "" : `WHERE ${whereClause}`;
  const order = orderBy.trim() === "" ? "" : `ORDER BY ${orderBy}`;
  const sql =
    `WITH fotos AS (SELECT * FROM main.fotos WHERE status = 'ok') ` +
    `SELECT img_id, path, name FROM fotos ${where} ${order} LIMIT ?`;

  logger.debug(`DB query: ${sql} [${maxFiles}]`);

  const db = openDbReadOnly(dbPath);
  let rows: FotoRow[];
  try {
    rows = db.prepare(sql).all(maxFiles) as unknown as FotoRow[];
  } finally {
    db.close();
  }

  const images: DbImage[] = rows.map((row) => ({
    id: row.img_id,
    fullPath: `${row.path}/${row.name}`,
    name: row.name,
  }));

  return { images, totalFromDb: images.length };
}

export interface ImageInfo {
  id: number;
  name: string;
  path: string;
  dtTaken: string | null;
  dtCreated: string | null;
  bytes: number | null;
  imgSize: string | null;
  camera: string | null;
  md5: string | null;
  // Only set for videos; shown on the "can't display" panel.
  duration: string | null;
}

export function getImageInfo(db: DatabaseSync, fotoId: number): ImageInfo | null {
  const stmt = db.prepare(
    "SELECT img_id, path, name, dt_taken, dt_created, bytes, img_size, camera, duration, md5 FROM fotos WHERE img_id = ?"
  );
  const row = stmt.get(fotoId) as FotoRow | undefined;
  if (!row) return null;

  return {
    id: row.img_id,
    name: row.name,
    path: `${row.path}/${row.name}`,
    dtTaken: row.dt_taken || null,
    dtCreated: row.dt_created || null,
    bytes: row.bytes ?? null,
    imgSize: row.img_size || null,
    camera: row.camera || null,
    md5: row.md5 || null,
    // `fotos` stores '-' rather than NULL for stills; normalize so callers
    // can just test for a value.
    duration: row.duration && row.duration !== '-' ? row.duration : null,
  };
}

export function insertAction(db: DatabaseSync, imgId: number, action: string, path?: string): void {
  const stmt = db.prepare(
    "INSERT INTO actions (action, img_id, status) VALUES (?, ?, 'pending')"
  );
  stmt.run(action, imgId);
  const actionUpper = action.toUpperCase();
  const pathInfo = path ? `path=${path}` : '';
  logger.info(`Action ${actionUpper}, img_id=${imgId}, ${pathInfo}`);
}

export function insertNote(
  db: DatabaseSync,
  imgId: number,
  category: string | null,
  rank: number | null,
  comment: string | null,
): void {
  const stmt = db.prepare(
    "INSERT INTO notes (category, rank, comment, img_id) VALUES (?, ?, ?, ?)"
  );
  stmt.run(category, rank, comment, imgId);
  logger.info(`Note saved, img_id=${imgId}, category=${category ?? ""}, rank=${rank ?? ""}`);
}

// True if a 'missing' note already exists for this image — used so a
// still-missing file doesn't get a fresh note on every request. See
// docs/reconcile.md.
export function hasMissingNote(db: DatabaseSync, imgId: number): boolean {
  const row = db.prepare(
    "SELECT 1 FROM notes WHERE img_id = ? AND LOWER(TRIM(category)) = 'missing' LIMIT 1"
  ).get(imgId);
  return row !== undefined;
}

// Clears the 'missing' flag for an image whose file has come back, returning
// how many notes were removed. A 'missing' note is a cached observation, not
// testimony: it is re-derivable by re-scanning, so leaving a stale one in place
// is worse than dropping it. The history lives in recon/recon.log, which
// records every insert and delete. Used by recon/findMissing.ts.
//
// Deletes the note whatever comment it carries — deliberate, so a scan never
// has to decide whether a comment makes a stale flag worth keeping.
export function deleteMissingNotes(db: DatabaseSync, imgId: number): number {
  const stmt = db.prepare(
    "DELETE FROM notes WHERE img_id = ? AND LOWER(TRIM(category)) = 'missing'"
  );
  const deleted = Number(stmt.run(imgId).changes);
  if (deleted > 0) {
    logger.info(`Missing note(s) cleared, img_id=${imgId}, count=${deleted}`);
  }
  return deleted;
}

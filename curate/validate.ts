// curate/validate.ts
//
// Auditor for three invariants between fotos/actions and the files on disk:
//
//   1. actions rows with action='delete', status IN ('done','gone') and
//      fotos.status='deleted' rows agree 1 to 1: each such action's img_id
//      is marked deleted, and each deleted row has exactly one such action
//   2. every fotos.status='deleted' row has no file at its path/name
//   3. every fotos.status!='deleted' row has a file at its path/name
//
// Checks every row every time, and never mutates anything unless --execute is
// given. After the checks it reports on the 'missing' notes, which should
// follow what is on disk, in both directions (status='ok' rows only):
//
//   file gone, no 'missing' note   -> a note would be inserted (category='missing', rank=5)
//   file gone, already flagged     -> nothing
//   file back, has 'missing' note  -> the note(s) would be DELETED
//   file there, not flagged        -> nothing
//
// --execute applies those note changes. It only touches `notes`; it never
// writes `fotos`, `actions`, or any image file, and it never changes the
// PASS/FAIL result or the exit code: a flagged file is still a missing file,
// so Check 3 keeps reporting it (marked "flagged"). A 'missing' note is a flag
// for a person, not an instruction. Turning one into a deletion stays a manual
// step (mark it 'delete', then notesToActions.sql -> executeDeletions.ts), so a
// bad scan can annotate but can never stage a deletion.
//
// The db is opened for writing only with --execute. --limit N caps how many
// note changes --execute applies (the checks are never capped); it is an error
// without --execute. --verbose adds a line per note change.
//
// The server (slideshow.ts /api/imageInfo) also writes a 'missing' note, lazily,
// for each image whose file is gone when its slide is about to load; this is
// the bulk, whole-catalog version, and it also retracts.
//
// The db file comes from params_shared.json at the project root
// (dbDir/dbName), found whatever the current directory is; there is no
// --params file.
//
// Prints row counts for fotos/notes/actions first, as context only. Everything
// printed is also appended to curate.log (relative to the current directory,
// so run from curate/), the same log notesToActions.sql and executeDeletions.ts
// write to. Exit code 0 if all three checks pass, 1 otherwise (also 1 on bad
// arguments, or if the image library looks unavailable).
// ==========================================
// Run from curate/ (paths resolve from the current directory):
//   deno run --allow-read --allow-write validate.ts [--execute [--limit N]] [--verbose]
// ==========================================

import { loadParams, ParamsError, dbFile } from "../lib/params.ts";
import {
  openDb,
  openDbReadOnly,
  fileExists,
  checkLibrary,
  hasMissingNote,
  insertNote,
  deleteMissingNotes,
} from "../dbase/db.ts";
import { logger } from "../lib/logger.ts";

interface ActionMismatchRow {
  action_id: number;
  img_id: number;
  foto_status: string | null;
}

interface DuplicateActionRow {
  img_id: number;
  n: number;
  action_ids: string;
}

interface FotoRow {
  img_id: number;
  path: string;
  name: string;
}

interface LiveRow extends FotoRow {
  status: string;
}

const LOG_PATH = logger.logFile();
const encoder = new TextEncoder();
let logFile: Deno.FsFile | null = null;

// Print to the screen and append to curate.log.
function say(msg = ""): void {
  console.log(msg);
  try {
    logFile ??= Deno.openSync(LOG_PATH, { create: true, append: true, write: true });
    logFile.writeSync(encoder.encode(msg + "\n"));
  } catch (err) {
    logger.warn(`validate: cannot write ${LOG_PATH}: ${err instanceof Error ? err.message : err}`);
  }
}

function argValue(flag: string): string | undefined {
  const i = Deno.args.indexOf(flag);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

const KNOWN_FLAGS = ["--execute", "--limit", "--verbose"];

async function main(): Promise<void> {
  // --limit takes a value, so the argument after it is not a flag.
  const unknown = Deno.args.filter((arg, i) =>
    Deno.args[i - 1] !== "--limit" && !KNOWN_FLAGS.includes(arg)
  );
  if (unknown.length > 0) {
    say(`ABORT — unknown argument(s): ${unknown.join(" ")}`);
    say(`Usage: validate.ts [--execute [--limit N]] [--verbose]`);
    Deno.exit(1);
  }
  const execute = Deno.args.includes("--execute");
  const verbose = Deno.args.includes("--verbose");
  const limitArg = argValue("--limit");
  if (!execute && limitArg !== undefined) {
    say("ABORT — --limit only applies with --execute.");
    Deno.exit(1);
  }
  const limit = limitArg !== undefined ? Number(limitArg) : Infinity;
  if (!(limit > 0)) {
    say("ABORT — --limit must be a positive number.");
    Deno.exit(1);
  }
  // Routine per-note progress: shown only with --verbose.
  const detail = verbose ? say : (_msg: string) => {};

  const params = await loadParams();
  logger.setLogLevel(params.logLevel);
  const dbPath = dbFile(params);

  say("");
  say(`=== validate.ts${execute ? " — EXECUTING" : ""} ===`);
  say(`run_at ${new Date().toLocaleString()}`);
  say(`db ${dbPath}\n`);

  // Only --execute needs to write.
  const db = execute ? openDb(dbPath) : openDbReadOnly(dbPath);

  // Library guard: without this, every live row's file would look missing
  // at once, and Check 3 would report a wall of false violations.
  const library = checkLibrary(db);
  if (!library.reachable) {
    say(`ABORT — none of the ${library.folders} image folder(s) in fotos.path exist, e.g. ${library.example}`);
    say(`The library looks unavailable (volume not mounted, stale paths, or wrong directory: ${Deno.cwd()}). No checks were run and nothing was changed.`);
    logger.error(`validate: no image folder in fotos.path exists, aborted (e.g. ${library.example})`);
    db.close();
    Deno.exit(1);
  }

  let overallPass = true;
  // Note changes --execute would make, collected during Check 3's pass.
  const toFlag: LiveRow[] = [];
  const toClear: LiveRow[] = [];
  let stillMissing = 0;
  let syncUnchanged = 0;

  try {
    // Row counts: context for the checks below, not a check themselves.
    // A notes row repeating an earlier one's img_id and category is a
    // duplicate and is counted once.
    const counts = db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM fotos) AS fotos,
         (SELECT COUNT(*) FROM fotos WHERE status = 'deleted') AS fotos_deleted,
         (SELECT COUNT(*) FROM (SELECT DISTINCT img_id, LOWER(TRIM(category)) FROM notes)) AS notes,
         (SELECT COUNT(DISTINCT img_id) FROM notes WHERE LOWER(TRIM(category)) = 'delete') AS notes_delete,
         (SELECT COUNT(DISTINCT img_id) FROM notes WHERE LOWER(TRIM(category)) = 'missing') AS notes_missing,
         (SELECT COUNT(*) FROM actions) AS actions,
         (SELECT COUNT(*) FROM actions WHERE action = 'delete' AND status = 'pending') AS actions_pending`
    ).get() as Record<string, number>;
    say(`row counts (excluding duplicate rows in notes):`);
    say(`fotos:   ${counts.fotos},  ${counts.fotos_deleted} are status='deleted'`);
    say(`notes:   ${counts.notes},  category='delete': ${counts.notes_delete},  category='missing': ${counts.notes_missing}`);
    say(`actions: ${counts.actions},  action='delete' and status='pending': ${counts.actions_pending}\n`);

    // Check 1: done/gone delete actions and fotos.status='deleted' pair up 1 to 1.
    say(`--- Check 1: done/gone delete actions and fotos.status='deleted' agree 1 to 1 ---`);
    // LEFT JOIN so an action whose img_id has no fotos row is caught too.
    const mismatches = db.prepare(
      `SELECT a.action_id, a.img_id, f.status AS foto_status
       FROM actions a LEFT JOIN fotos f ON f.img_id = a.img_id
       WHERE a.action = 'delete' AND a.status IN ('done','gone')
         AND (f.status IS NULL OR f.status != 'deleted')
       ORDER BY a.action_id`
    ).all() as unknown as ActionMismatchRow[];
    const unbacked = db.prepare(
      `SELECT f.img_id FROM fotos f
       WHERE f.status = 'deleted' AND NOT EXISTS (
         SELECT 1 FROM actions a
         WHERE a.img_id = f.img_id AND a.action = 'delete' AND a.status IN ('done','gone'))
       ORDER BY f.img_id`
    ).all() as unknown as { img_id: number }[];
    const duplicates = db.prepare(
      `SELECT img_id, COUNT(*) AS n, GROUP_CONCAT(action_id) AS action_ids
       FROM actions WHERE action = 'delete' AND status IN ('done','gone')
       GROUP BY img_id HAVING COUNT(*) > 1 ORDER BY img_id`
    ).all() as unknown as DuplicateActionRow[];
    const checked1 = (db.prepare(
      `SELECT COUNT(*) AS n FROM actions WHERE action = 'delete' AND status IN ('done','gone')`
    ).get() as { n: number }).n;
    const deleted1 = (db.prepare(
      `SELECT COUNT(*) AS n FROM fotos WHERE status = 'deleted'`
    ).get() as { n: number }).n;
    for (const row of mismatches) {
      const found = row.foto_status === null ? "no fotos row" : `fotos.status='${row.foto_status}'`;
      say(`FAIL       action_id=${row.action_id} img_id=${row.img_id} — ${found}, expected 'deleted'`);
    }
    for (const row of unbacked) {
      say(`FAIL       img_id=${row.img_id} — fotos.status='deleted' but no done/gone delete action`);
    }
    for (const row of duplicates) {
      say(`FAIL       img_id=${row.img_id} — deleted once but has ${row.n} completed (done/gone) delete actions (action_id ${row.action_ids}); expected exactly 1. Probably notesToActions.sql re-staged an already-deleted image.`);
    }
    const violations1 = mismatches.length + unbacked.length + duplicates.length;
    const pass1 = violations1 === 0;
    overallPass &&= pass1;
    say(`${checked1} done/gone delete action(s) and ${deleted1} deleted row(s) checked; ${violations1} violation(s).`);
    say(pass1 ? "Check 1: PASS" : "Check 1: FAIL");

    // Check 2: deleted rows have no file on disk.
    say(`\n--- Check 2: fotos.status='deleted' rows have no file on disk ---`);
    const deletedRows = db.prepare(
      "SELECT img_id, path, name FROM fotos WHERE status = 'deleted' ORDER BY img_id"
    ).all() as unknown as FotoRow[];
    let deleted2Violations = 0;
    for (const row of deletedRows) {
      const fullPath = `${row.path}/${row.name}`;
      if (fileExists(fullPath)) {
        deleted2Violations++;
        say(`FAIL       img_id=${row.img_id} — status='deleted' but file still present: ${fullPath}`);
      }
    }
    const pass2 = deleted2Violations === 0;
    overallPass &&= pass2;
    say(`${deletedRows.length} deleted row(s) checked; ${deleted2Violations} violation(s).`);
    say(pass2 ? "Check 2: PASS" : "Check 2: FAIL");

    // Check 3: live rows have a file on disk.
    say(`\n--- Check 3: fotos.status!='deleted' rows have a file on disk ---`);
    const liveRows = db.prepare(
      "SELECT img_id, path, name, status FROM fotos WHERE status != 'deleted' ORDER BY img_id"
    ).all() as unknown as LiveRow[];
    let live3Violations = 0;
    for (const row of liveRows) {
      const fullPath = `${row.path}/${row.name}`;
      const onDisk = fileExists(fullPath);
      const flagged = hasMissingNote(db, row.img_id);
      if (!onDisk) {
        live3Violations++;
        say(`FAIL       img_id=${row.img_id} — status is live but file missing${flagged ? " (flagged)" : ""}: ${fullPath}`);
      }
      // The sync looks only at status='ok' rows.
      if (row.status !== "ok") continue;
      if (!onDisk && !flagged) toFlag.push(row);
      else if (!onDisk && flagged) stillMissing++;
      else if (onDisk && flagged) toClear.push(row);
      else syncUnchanged++;
    }
    const pass3 = live3Violations === 0;
    overallPass &&= pass3;
    say(`${liveRows.length} live row(s) checked; ${live3Violations} violation(s).`);
    say(pass3 ? "Check 3: PASS" : "Check 3: FAIL");

    say(`\n--- Missing notes follow what is on disk (status='ok' rows) ---`);
    // --limit caps the writes; the plan above is always complete.
    let applied = 0;
    let deferred = 0;
    const todo: [string, LiveRow][] = [
      ...toFlag.map((r): [string, LiveRow] => ["flag", r]),
      ...toClear.map((r): [string, LiveRow] => ["clear", r]),
    ];
    for (const [kind, row] of todo) {
      const fullPath = `${row.path}/${row.name}`;
      const tag = `img_id=${row.img_id}`;
      if (execute && applied >= limit) {
        deferred++;
        continue;
      }
      if (kind === "flag") {
        detail(`${execute ? "FLAG      " : "WOULD FLAG"} ${tag} — ${fullPath}`);
        if (execute) insertNote(db, row.img_id, "missing", 5, `File not found: ${fullPath} (scan)`);
      } else {
        detail(`${execute ? "CLEAR     " : "WOULD CLEAR"} ${tag} — file is back: ${fullPath}`);
        if (execute) deleteMissingNotes(db, row.img_id);
      }
      applied++;
    }
    const label = execute ? "" : "would be ";
    const flaggedN = execute ? Math.min(toFlag.length, applied) : toFlag.length;
    const clearedN = execute ? applied - flaggedN : toClear.length;
    say(`  flagged missing  ${flaggedN}\t(note ${label}added)`);
    say(`  cleared          ${clearedN}\t(file is back, note ${label}deleted)`);
    say(`  still missing    ${stillMissing}\t(already flagged, left alone)`);
    say(`  unchanged        ${syncUnchanged}\t(file present, not flagged)`);
    if (deferred > 0) say(`  not applied      ${deferred}\t(over --limit ${limit}; re-run to continue)`);
    if (!execute) say(`\nNothing was changed. Re-run with --execute (optionally --limit N) to apply the note changes.`);
  } finally {
    db.close();
  }

  say(`\n=== Overall: ${overallPass ? "PASS" : "FAIL"} ===`);
  if (!overallPass) Deno.exit(1);
}

main().catch((error) => {
  // Exit 1 on a bad start rather than reporting on half-loaded settings.
  // A ParamsError has already said its piece; anything else has not.
  if (!(error instanceof ParamsError)) console.error(error);
  Deno.exit(1);
});

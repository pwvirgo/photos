// curate/findMissing.ts
//
// Keeps the 'missing' notes in sync with what is actually on disk, in both
// directions:
//
// Only touches `notes`. Never reads or writes `fotos`, `actions`, or any image
// file. Only status='ok' rows are scanned — a status='deleted' row's file is gone
// on purpose, because the deletion step moved it to trash.
//
//   file gone, no 'missing' note   -> insert one  (category='missing', rank=5)
//   file gone, already flagged     -> nothing
//   file back, has 'missing' note  -> DELETE the note(s)
//   file there, not flagged        -> nothing
//
// The server already does the first case lazily, one image at a time, as each
// slide is about to load (slideshow.ts /api/imageInfo). That only ever sees images
// the current whereClause selects, so files removed outside that
// selection go unnoticed, and a note is never retracted once written. This is
// the bulk, whole-catalog version, and it retracts.
//
// A 'missing' note is a flag for a person, not an instruction. Turning one into
// a deletion stays a manual step (mark it 'delete', then curate/notesToActions.sql
// -> curate/executeDeletions.ts). That split is what makes auto-clearing safe: a
// bad scan can annotate, but it can never stage a deletion.
//
// Guard: if none of the folders in fotos.path exists (checkLibrary in
// dbase/db.ts), the run aborts without writing anything. That is the
// unmounted-volume or stale-path case, where every file would otherwise look
// missing at once. One existing folder is enough — a folder you deleted on
// purpose should still be flagged.
//
// Dry-run by default. The db file comes from params_shared.json at the project
// root (dbDir/dbName); --params names this module's own file and is required.
// Prints a counts summary; --verbose adds a line per image. Everything printed
// is also appended to curate.log (relative to the current directory, so run
// from curate/), the same log notesToActions.sql and executeDeletions.ts write to.
//   deno run --allow-read --allow-write findMissing.ts --params=<file> [--execute] [--limit N] [--verbose]

import { loadParams, paramsPathFromArgs, noParamsFileMessage, ParamsError, dbFile } from "../lib/params.ts";
import {
  openDb,
  fileExists,
  checkLibrary,
  hasMissingNote,
  insertNote,
  deleteMissingNotes,
} from "../dbase/db.ts";
import { logger } from "../lib/logger.ts";

interface FotoRow {
  img_id: number;
  path: string;
  name: string;
}

const SCRIPT = "findMissing.ts";
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
    logger.warn(`findMissing: cannot write ${LOG_PATH}: ${err instanceof Error ? err.message : err}`);
  }
}

function argValue(flag: string): string | undefined {
  const i = Deno.args.indexOf(flag);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const execute = Deno.args.includes("--execute");
  const verbose = Deno.args.includes("--verbose");
  // Routine per-image progress: shown only with --verbose. Problems use say().
  const detail = verbose ? say : (_msg: string) => {};
  const limit = argValue("--limit") ? Number(argValue("--limit")) : Infinity;
  if (!(limit > 0)) throw new Error("--limit must be a positive number");

  const paramsFile = paramsPathFromArgs();
  if (!paramsFile) {
    say(`ABORT — ${noParamsFileMessage()}`);
    logger.error(`findMissing: no params file given`);
    Deno.exit(1);
  }
  const params = await loadParams(paramsFile);
  logger.setLogLevel(params.logLevel);
  const dbPath = dbFile(params);

  say("");
  say(`=== ${SCRIPT} — ${execute ? "EXECUTING" : "DRY RUN"} ===`);
  say(`run_at ${new Date().toLocaleString()}   params ${paramsFile}`);
  say(`db ${dbPath}\n`);

  const db = openDb(dbPath);

  // Library guard: bail before writing anything.
  const library = checkLibrary(db);
  if (!library.reachable) {
    say(`ABORT — none of the ${library.folders} image folder(s) in fotos.path exist, e.g. ${library.example}`);
    say(`The library looks unavailable (volume not mounted, stale paths, or wrong directory: ${Deno.cwd()}). Nothing was changed.`);
    logger.error(`findMissing: no image folder in fotos.path exists, aborted (e.g. ${library.example})`);
    Deno.exit(1);
  }

  const all = db.prepare(
    "SELECT img_id, path, name FROM fotos WHERE status = 'ok' ORDER BY img_id"
  ).all() as unknown as FotoRow[];
  const rows = all.slice(0, limit);

  if (rows.length === 0) {
    say("Nothing to do — no live images in the catalog. Nothing was changed.");
    return;
  }

  const counts = { flagged: 0, cleared: 0, stillMissing: 0, unchanged: 0 };

  for (const row of rows) {
    const fullPath = `${row.path}/${row.name}`;
    const onDisk = fileExists(fullPath);
    const flagged = hasMissingNote(db, row.img_id);
    const tag = `img_id=${row.img_id}`;

    if (!onDisk && !flagged) {
      counts.flagged++;
      detail(`${execute ? "FLAG      " : "WOULD FLAG"} ${tag} — ${fullPath}`);
      if (execute) {
        insertNote(db, row.img_id, "missing", 5, `File not found: ${fullPath} (scan)`);
      }
      continue;
    }

    if (!onDisk && flagged) {
      counts.stillMissing++;
      detail(`STILL GONE ${tag} — already flagged: ${fullPath}`);
      continue;
    }

    if (onDisk && flagged) {
      counts.cleared++;
      detail(`${execute ? "CLEAR     " : "WOULD CLEAR"} ${tag} — file is back: ${fullPath}`);
      if (execute) deleteMissingNotes(db, row.img_id);
      continue;
    }

    counts.unchanged++;
  }

  const label = execute ? "" : "would be ";
  say(`\n${all.length} live image(s) in the catalog; ${rows.length} scanned.`);
  say(`  flagged missing  ${counts.flagged}\t(note ${label}added)`);
  say(`  cleared          ${counts.cleared}\t(file is back, note ${label}deleted)`);
  say(`  still missing    ${counts.stillMissing}\t(already flagged, left alone)`);
  say(`  unchanged        ${counts.unchanged}\t(file present, not flagged)`);
  if (!execute) {
    say(`\nDry run — nothing was changed. Re-run with --execute (optionally --limit N) to apply.`);
  }
}

main().catch((error) => {
  // Exit 1 on a bad start rather than running on half-loaded settings.
  // A ParamsError has already said its piece; anything else has not.
  if (!(error instanceof ParamsError)) console.error(error);
  Deno.exit(1);
});

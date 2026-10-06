// curate/validate.ts
//
// Read-only auditor for three invariants between fotos/actions and the
// files on disk:
//
//   1. actions rows with action='delete', status IN ('done','gone') and
//      fotos.status='deleted' rows agree 1 to 1: each such action's img_id
//      is marked deleted, and each deleted row has exactly one such action
//   2. every fotos.status='deleted' row has no file at its path/name
//   3. every fotos.status!='deleted' row has a file at its path/name
//
// Checks every row every time — never mutates anything, so there's no
// blast radius to cap and no dry-run/--execute split. The db file comes
// from params_shared.json at the project root (dbDir/dbName).
//
// Prints row counts for fotos/notes/actions first, as context only — they
// do not affect the result.
//
// Reports to stdout.The only file it may write is curate.log, and only if
// loading params raises a warning — hence --allow-write. Exit code 0 if all
// three checks pass, 1 otherwise.
// ==========================================
//   deno run --allow-read --allow-write validate.ts --params=params_curate.json
// ==========================================

// ==========================================

import { loadParams, paramsPathFromArgs, noParamsFileMessage, ParamsError, dbFile } from "../lib/params.ts";
import { openDbReadOnly, fileExists, checkLibrary } from "../dbase/db.ts";

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

async function main(): Promise<void> {
  const paramsFile = paramsPathFromArgs();
  if (!paramsFile) {
    console.log(`ABORT — ${noParamsFileMessage()}`);
    Deno.exit(1);
  }
  const params = await loadParams(paramsFile);
  const dbPath = dbFile(params);

  console.log(`=== validate.ts — db ${dbPath} ===\n`);

  const db = openDbReadOnly(dbPath);

  // Library guard: without this, every live row's file would look missing
  // at once, and Check 3 would report a wall of false violations.
  const library = checkLibrary(db);
  if (!library.reachable) {
    console.log(`ABORT — none of the ${library.folders} image folder(s) in fotos.path exist, e.g. ${library.example}`);
    console.log(`The library looks unavailable (volume not mounted, stale paths, or wrong directory: ${Deno.cwd()}). No checks were run.`);
    db.close();
    Deno.exit(1);
  }

  let overallPass = true;

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
    console.log(`row counts (excluding duplicate rows in notes):`);
    console.log(`fotos:   ${counts.fotos},  ${counts.fotos_deleted} are status='deleted'`);
    console.log(`notes:   ${counts.notes},  category='delete': ${counts.notes_delete},  category='missing': ${counts.notes_missing}`);
    console.log(`actions: ${counts.actions},  action='delete' and status='pending': ${counts.actions_pending}\n`);

    // Check 1: done/gone delete actions and fotos.status='deleted' pair up 1 to 1.
    console.log(`--- Check 1: done/gone delete actions and fotos.status='deleted' agree 1 to 1 ---`);
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
      console.log(`FAIL       action_id=${row.action_id} img_id=${row.img_id} — ${found}, expected 'deleted'`);
    }
    for (const row of unbacked) {
      console.log(`FAIL       img_id=${row.img_id} — fotos.status='deleted' but no done/gone delete action`);
    }
    for (const row of duplicates) {
      console.log(`FAIL       img_id=${row.img_id} — ${row.n} done/gone delete actions (action_id ${row.action_ids}), expected 1`);
    }
    const violations1 = mismatches.length + unbacked.length + duplicates.length;
    const pass1 = violations1 === 0;
    overallPass &&= pass1;
    console.log(`${checked1} done/gone delete action(s) and ${deleted1} deleted row(s) checked; ${violations1} violation(s).`);
    console.log(pass1 ? "Check 1: PASS" : "Check 1: FAIL");

    // Check 2: deleted rows have no file on disk.
    console.log(`\n--- Check 2: fotos.status='deleted' rows have no file on disk ---`);
    const deletedRows = db.prepare(
      "SELECT img_id, path, name FROM fotos WHERE status = 'deleted' ORDER BY img_id"
    ).all() as unknown as FotoRow[];
    let deleted2Violations = 0;
    for (const row of deletedRows) {
      const fullPath = `${row.path}/${row.name}`;
      if (fileExists(fullPath)) {
        deleted2Violations++;
        console.log(`FAIL       img_id=${row.img_id} — status='deleted' but file still present: ${fullPath}`);
      }
    }
    const pass2 = deleted2Violations === 0;
    overallPass &&= pass2;
    console.log(`${deletedRows.length} deleted row(s) checked; ${deleted2Violations} violation(s).`);
    console.log(pass2 ? "Check 2: PASS" : "Check 2: FAIL");

    // Check 3: live rows have a file on disk.
    console.log(`\n--- Check 3: fotos.status!='deleted' rows have a file on disk ---`);
    const liveRows = db.prepare(
      "SELECT img_id, path, name FROM fotos WHERE status != 'deleted' ORDER BY img_id"
    ).all() as unknown as FotoRow[];
    let live3Violations = 0;
    for (const row of liveRows) {
      const fullPath = `${row.path}/${row.name}`;
      if (!fileExists(fullPath)) {
        live3Violations++;
        console.log(`FAIL       img_id=${row.img_id} — status is live but file missing: ${fullPath}`);
      }
    }
    const pass3 = live3Violations === 0;
    overallPass &&= pass3;
    console.log(`${liveRows.length} live row(s) checked; ${live3Violations} violation(s).`);
    console.log(pass3 ? "Check 3: PASS" : "Check 3: FAIL");
  } finally {
    db.close();
  }

  console.log(`\n=== Overall: ${overallPass ? "PASS" : "FAIL"} ===`);
  if (!overallPass) Deno.exit(1);
}

main().catch((error) => {
  // Exit 1 on a bad start rather than reporting on half-loaded settings.
  // A ParamsError has already said its piece; anything else has not.
  if (!(error instanceof ParamsError)) console.error(error);
  Deno.exit(1);
});

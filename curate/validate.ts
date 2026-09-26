// curate/validate.ts
//
// Read-only auditor for three invariants between fotos/actions and the
// files on disk:
//
//   1. every actions row with action='delete', status IN ('done','gone') has
//      fotos.status='deleted' for that img_id
//   2. every fotos.status='deleted' row has no file at its path/name
//   3. every fotos.status!='deleted' row has a file at its path/name
//
// Checks every row every time — never mutates anything, so there's no
// blast radius to cap and no dry-run/--execute split. Db file and image
// root come from the params file named by --params (dataDir/dbName,
// imageFolderPath); its `source` must be "db".
//
// Prints a PASS/FAIL summary per check plus a line per violation, to
// stdout only. Exit code 0 if all three checks pass, 1 otherwise.
//   deno run --allow-read validate.ts --params=<file>

import { loadParams, paramsPathFromArgs, noParamsFileMessage, sourceMismatch, ParamsError, dbFile } from "../lib/params.ts";
import { openDbReadOnly, fileExists } from "../dbase/db.ts";

interface ActionMismatchRow {
  action_id: number;
  img_id: number;
  foto_status: string;
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
  // This script only makes sense against the photo database. The params file
  // says so itself, in `source` — a folder-mode file would hand us the wrong
  // dataDir/dbName and image root, and we would happily act on them.
  const mismatch = sourceMismatch(params, "db", paramsFile);
  if (mismatch) {
    console.log(`ABORT — ${mismatch}`);
    Deno.exit(1);
  }
  const dbPath = dbFile(params);
  const imageRoot = params.imageFolderPath.replace(/\/+$/, "");

  console.log(`=== validate.ts — db ${dbPath}   root ${imageRoot} ===\n`);

  // Unmounted-volume guard: without this, every live row's file would look
  // missing at once, and Check 3 would report a wall of false violations.
  try {
    if (!Deno.statSync(imageRoot).isDirectory) throw new Error();
  } catch {
    console.log(`ABORT — image root not found: ${imageRoot}`);
    console.log("The library looks unavailable (volume not mounted?). No checks were run.");
    Deno.exit(1);
  }

  const db = openDbReadOnly(dbPath);
  let overallPass = true;

  try {
    // Check 1: every done/gone delete action's image is marked deleted.
    console.log(`--- Check 1: done/gone delete actions have fotos.status='deleted' ---`);
    const mismatches = db.prepare(
      `SELECT a.action_id, a.img_id, f.status AS foto_status
       FROM actions a JOIN fotos f ON f.img_id = a.img_id
       WHERE a.action = 'delete' AND a.status IN ('done','gone') AND f.status != 'deleted'`
    ).all() as unknown as ActionMismatchRow[];
    const checked1 = (db.prepare(
      `SELECT COUNT(*) AS n FROM actions WHERE action = 'delete' AND status IN ('done','gone')`
    ).get() as { n: number }).n;
    for (const row of mismatches) {
      console.log(`FAIL       action_id=${row.action_id} img_id=${row.img_id} — fotos.status='${row.foto_status}', expected 'deleted'`);
    }
    const pass1 = mismatches.length === 0;
    overallPass &&= pass1;
    console.log(`${checked1} done/gone delete action(s) checked; ${mismatches.length} violation(s).`);
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

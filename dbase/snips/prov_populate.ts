// dbase/snips/prov_populate.ts
// One-off: copy the prov row of the first photo of a time-lapse (IM000187)
// to the rest of the series (IM000188..IM000201), numbering the title
// ("Picnic 01" -> "Picnic 02", ...). Photos are matched by name, not img_id —
// the ids are not in name order.
//
//   deno run --allow-read --allow-write prov_populate.ts <db path> [--execute]
//
// Dry run unless --execute. Never overwrites an existing prov row.

import { openDb, getProv, saveProv } from "../db.ts";

const PREFIX = "IM000";
const FIRST = 187;
const LAST = 201;

const dbPath = Deno.args.find((a) => !a.startsWith("--"));
const execute = Deno.args.includes("--execute");
if (!dbPath) {
  console.error("usage: prov_populate.ts <db path> [--execute]");
  Deno.exit(1);
}

const db = openDb(dbPath);

// The camera reused file names, so IM000187 etc. also exist in other folders.
// The series is the folder of the IM000187 that has the prov row.


const rows = db.prepare(
  `SELECT img_id, path, name FROM fotos
   WHERE status = 'ok' AND name LIKE ?`,
).all(`${PREFIX}%`) as unknown as 
   { img_id: number; path: string; name: string }[];

const seriesNum = (name: string) => {
  const m = name.match(new RegExp(`^${PREFIX}(\\d{3})(\\.|$)`));
  return m ? Number(m[1]) : null;
};

const firsts = rows.filter((r) => 
  seriesNum(r.name) === FIRST && getProv(db, r.img_id));

if (firsts.length !== 1) {
  console.error(`${PREFIX}${FIRST}: expected 1 photo with a prov row, found ${firsts.length}`);
  Deno.exit(1);
}
const folder = firsts[0].path;
console.log(`Folder: ${folder}`);

// img_ids by series number, within that folder
const byNum = new Map<number, number[]>();
for (const r of rows) {
  const n = seriesNum(r.name);
  if (r.path !== folder || n === null || n < FIRST || n > LAST) continue;
  byNum.set(n, [...(byNum.get(n) ?? []), r.img_id]);
}
for (let n = FIRST; n <= LAST; n++) {
  const ids = byNum.get(n) ?? [];
  if (ids.length !== 1) {
    console.error(`${PREFIX}${n}: expected 1 fotos row, found ${ids.length} (${ids.join(", ")})`);
    Deno.exit(1);
  }
}

const srcId = byNum.get(FIRST)![0];
const src = getProv(db, srcId);
if (!src) {
  console.error(`No prov row for ${PREFIX}${FIRST} (img_id ${srcId})`);
  Deno.exit(1);
}
const t = (src.title ?? "").match(/^(.*?)(\d+)$/);
if (!t) {
  console.error(`Title "${src.title}" does not end in a number`);
  Deno.exit(1);
}
const [, titleStem, titleNum] = t;

console.log(`${execute ? "EXECUTING" : "DRY RUN"} — source ${PREFIX}${FIRST} img_id ${srcId} "${src.title}"`);
let added = 0, skipped = 0;
db.exec("BEGIN");
try {
  for (let n = FIRST + 1; n <= LAST; n++) {
    const id = byNum.get(n)![0];
    const title = titleStem +
      String(Number(titleNum) + n - FIRST).padStart(titleNum.length, "0");
    if (getProv(db, id)) {
      console.log(`  skip  ${PREFIX}${n} img_id ${id} — already has a prov row`);
      skipped++;
      continue;
    }
    console.log(`  ${execute ? "add " : "would add"}  ${PREFIX}${n} img_id ${id} "${title}"`);
    if (execute) saveProv(db, id, { ...src, title });
    added++;
  }
  db.exec(execute ? "COMMIT" : "ROLLBACK");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}
db.close();
console.log(`${execute ? "Added" : "Would add"} ${added}, skipped ${skipped}.`);

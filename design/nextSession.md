# Next session — 2026-09-19

Paste this when you come back:

do not make any changes unless I ask for them, else this is a discussion.

▎ Continuing slideshow work. Read docs/nextSession.md first — it has the state
▎ of the working tree and the plan for the new combined project.

---

## Start here

**Name the project and its modules.** That is the only decision blocking the
build, and you left it open. Everything else below is either decided or safely
deferrable.

## State of the tree

Clean at `0ad24bd` "Consolidate the reconciliation docs into docs/reconcile.md"
— 9 files, +332/−149. **Not pushed.**

That commit: `docs/reconcile.md` (new, 310 lines) is now the full account of the
notes → actions → execution pipeline; the README keeps two summaries marked as
digests of it; `design/SS_Document.md` deleted, emptying `design/`;
`recon/history/migrate.sql` header prose rewritten (SQL untouched); `tableName`
demoted to `"fotos -- not yet implemented"` and its CLAUDE.md bullet dropped;
five stale `design/missing_files.md` comment pointers repointed to
`docs/reconcile.md` in `slideshow.ts`, `lib/db.ts` and `static/app.js`.

Untracked and deliberately left alone: `recon/recon.log`, `temp/`.

Verified after the commit: no `design/` references remain anywhere; `tableName`
appears only in `params_db.json` and this file; server boots on
`params_db.json` and loads 18 images under the current md5-duplicate
`whereClause`.

## The new project

Three actors:

- **photos** — creates and populates the image catalog. Owns `fotos`.
- **recon** — reconciliation: notes → actions → execution. The only code that
  moves or destroys a file.
- **slideshow** — selectively displays images and metadata, adds notes. **Only
  ever INSERTs into `notes`.**

### Layout

```
README.md              big picture: the three actors, the order of operations
docs/
  database.md          schema — the one doc both sides depend on
lib/                   Deno/TS, shared by recon + slideshow only
  params.ts logger.ts db.ts
photos/                catalog builder — owns `fotos`
  README.md  *.py *.zsh *.sql
recon/                 notes -> actions -> execution; the only destructive code
  README.md  findMissing.ts  executeDeletions.ts  notesToActions.sql  history/
  params_recon.json
slideshow/             viewer; only ever INSERTs into `notes`
  README.md  slideshow.ts  static/
  params_slideshow.json
```

Data stays outside the repo, as it already does.

### What moves where

| From | To |
|---|---|
| slideshow `slideshow.ts`, `static/` | `slideshow/` |
| slideshow `recon/` | `recon/` (promoted to top level) |
| slideshow `lib/` | `lib/` (unchanged, now shared by two modules) |
| slideshow `docs/reconcile.md` | loses its first third → `recon/README.md` |
| photos `*.py`/`*.zsh`/`*.sql` | `photos/` |
| photos `docs/data_dictionary.md` | merges into `docs/database.md` |

### The write rule, made explicit

This is what one repo buys you — today it is a filesystem accident that
`executeDeletions.ts` lives in slideshow and writes `fotos.status`.

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| photos | create/populate | — | — | reads |
| recon | `status`, `path`/`name` | insert/delete `missing` | insert, update status | **moves/destroys** |
| slideshow | read | insert | — | reads |

### Why one project rather than keeping two

The two-repo boundary already fails to enforce what it was meant to. One repo
makes the rule explicit and documented instead of accidental, and solves the
shared-code problem. `recon/` gets its own top-level directory rather than
living under photos, because it is the only thing that touches files
destructively. That should be visible.

### Migration approach

Copy the images and db into the new project. Get it working there. Keep the
current projects and the SSD untouched until you have stopped reaching for
them. Nothing is migrated in place; nothing needs to be un-done if it fails.

**The agreed order of work is: refactor first, verify, then change the schema,
then add features.** Do not start with the interesting parts.

## Decided

### This session

- **`lib/` is the TS modules' library, not the project's.** `../photos` is 12
  tracked files of zsh/python/SQL — there is no common runtime with the Deno/TS
  side, so `lib/` is shared by `recon/` and `slideshow/` only and `photos/`
  shares nothing. Say so in the root README so its absence from `photos/` does
  not read as an oversight. **Unifying the runtimes is deferred indefinitely** —
  rewriting working zsh in TS is exactly the interesting part to not start with.
- **Params split per module.** `slideshow/params_slideshow.json`,
  `recon/params_recon.json`, none for `photos/` (nothing there reads one today).
  Reason: one file currently configures both a read-only viewer and the code
  that destroys files. This also *replaces* `source`'s job — location and
  filename bind a file to its module structurally, with no runtime check.
- **`dataDir` becomes absolute.** Zero code change: `dbFile()`
  (`lib/params.ts:40`) is pure string concatenation and never resolves, so a
  relative `dataDir` silently follows **cwd**, not the project root as its
  comment claims. Harmless today (everything runs from the root) but a live
  hazard once `params_recon.json` sits in `recon/` — that is the script that
  moves files to trash. Absolute values sidestep it with no work. `trashDir`
  inherits via the `${dataDir}/trash` default, and `imageFolderPath` is already
  absolute.
  - Caveat, not worth acting on yet: params files are **tracked in git** and the
    project is also used on an iMac with different paths. When that bites,
    gitignore the params files and commit `params_*.example.json` instead.
  - Reversible to per-module-relative later if ever wanted.

### Earlier, still standing

- **Folder mode goes away — but is NOT DONE.** This was decided only. Still
  present: `lib/scanner.ts`, `params_folder.json`, and `source` referenced in
  six files (`slideshow.ts`, `lib/params.ts`, `static/app.js`,
  `static/params.js`, `recon/executeDeletions.ts`, `recon/findMissing.ts`).
  Removal also takes `maxDepth`, `sourceMismatch()`, `sourceInput` and
  `updateSourceUI()`. This partly unwinds commit `83b0520`; that is expected.
  - The Control Panel has **no** folder-specific fields — `#folder-params` in
    `static/params.html:75-76` is an empty placeholder.
  - `--params` survives, for a different reason: several db-mode files with
    different `whereClause`/`orderBy` per review session.
- **Do not rebuild `fotos` after reorganizing.** A rebuild regenerates `img_id`,
  and every note and action points at images by `img_id` alone — 1,949 executed
  deletes included. Instead `mv` execution updates `fotos.path`/`fotos.name` in
  place, in the same transaction as the action status, exactly as deletion
  already updates `fotos.status`.
- **Provenance does not depend on folder layout.** It is `md5`: 7,269 live rows,
  0 missing, 7,260 distinct. Point at the SSD, recompute, everything matches
  wherever you have since moved it.
- **`tableName` will not be implemented.** Settled and committed. If it is ever
  built, note it is the one params value interpolated into SQL as an
  *identifier* (no `?` binding), so it needs a strict
  `/^[A-Za-z_][A-Za-z0-9_]*$/` check — `checkSqlFragment()` only rejects `;`.
  Also `recon/notesToActions.sql` is plain SQL and cannot read a params file at
  all, so it can never follow the setting.

## Open — name this first

**Names for the project and the three modules.** You are open to suggestions;
nothing else waits on anything else.

## Time-sensitive — decide before writing any `mv` notes

The **comment format for `mv` notes**. The only deferred decision that costs
something to defer, because notes accumulate in whatever format you type and a
few thousand free-form destinations are painful to parse later.

`mv` is already legal in the schema and the Notes form takes any category, so
**you can record moves today with zero code changes**. `notesToActions.sql`
matches `LOWER(TRIM(category))='delete'` and ignores everything else, so `mv`
notes sit inert while you keep doing deletes.

Proposed convention — destination relative to the image root, trailing slash
means "folder, keep the name":

```
2019/italy/                    move into that folder, same filename
2019/italy/duomo_at_dusk.jpg   move and rename
duomo_at_dusk.jpg              rename in place
```

If you would rather not decide yet, just keep writing `delete` notes.

### When `mv` is built

- **Do not copy the delete skip rule.** `notesToActions.sql` skips any image
  that already has a `delete` action of any status — correct for delete, wrong
  for `mv`. Moving twice is meaningful; the second move would silently vanish.
- Resume-after-crash is *easier* than for delete: the destination is known and
  `md5` confirms identity, so no `<stem>_<img_id><ext>` name-mangling needed.
- Record `<old path> -> <new path>` in `actions.info`, not just the destination.
- Needs `mkdir -p` for destination folders.
- Rules to settle: image with both a `delete` and an `mv` note (suggest: report,
  stage neither); destination already occupied (suggest: conflict, skip,
  report).

## Deferred — no cost to leaving these open

- **`orig_md5` / identity ledger.** Editing breaks md5-as-identity, so you need
  two things: `md5` (current file, changes on every edit) and the original hash
  (set once, never changes). A **side lookup table** keyed on content hash is
  the better shape — immune to a `fotos` rebuild, and it does three jobs at
  once: provenance under editing, a snapshot of the original metadata, and, if
  it stores the old `img_id`, the re-match bridge for any future rebuild.
  - Make it **append-only, never re-keyed**: one row per hash a file has ever
    had. An edit appends; nothing is updated.
  - **md5 is not unique in your data** — 9 duplicate groups among 7,260
    distinct hashes. No `UNIQUE` constraint; lookups must tolerate >1 row.
  - Open: is the ledger the source of truth, or a materialized view of
    `actions`? (Lean: source of truth. `actions` records what you asked for; the
    ledger records what the bytes actually did.)
- **In-place edits vs. derivatives.** In place = one row, `md5` changes, history
  in `actions`; the original pixels live only on the SSD. Derivative = a new row
  with `parent_img_id`, both viewable. In-place is defensible *while the SSD
  exists* — but you plan to delete the originals eventually, and that is the day
  the pre-edit pixels are gone for good. Decide deliberately.
- **Does the lazy per-slide missing check stay?** Under a strict reading it is
  reconciliation and belongs to recon; under a loose one it is the viewer
  annotating what it sees. Related: it appears to have **no unmounted-volume
  guard**, so an unplugged drive during a slideshow could write one `missing`
  note per image in the whole `whereClause`. `findMissing.ts` would clear them
  on the next pass, but verify the gap in the code before relying on that.
- **Where the operator runbook lives.** Per-module docs are easy; the
  cross-module order of operations belongs to the *human/ai* actor, which is not
  a module. Current answer: the root README.

## Baseline — capture before moving anything

"It works" needs a number. Record these from the *current* db, then check the
copy after the move reports the same:

| | |
|---|---|
| live `fotos` rows (`status='ok'`) | 7,269 |
| rows with missing md5 | 0 |
| distinct md5 / duplicate groups | 7,260 / 9 |
| `delete` actions done / failed | 1,949 / 13 |
| pending actions | 0 |
| `delete` notes waiting | 28 |

Plus: the slideshow's image count under your usual `whereClause` (18 under the
current md5-duplicate clause, as of `0ad24bd`), and `findMissing.ts` dry run
reporting 0 changes.

```bash
DB=../photos/photos3.db
sqlite3 -init /dev/null -batch $DB "
  SELECT COUNT(*) AS rows_ok,
         SUM(md5 IS NULL OR TRIM(md5)='') AS md5_missing,
         COUNT(DISTINCT md5) AS distinct_md5 FROM fotos WHERE status='ok';
  SELECT action, status, COUNT(*) FROM actions GROUP BY 1,2;
  SELECT category, COUNT(*) FROM notes GROUP BY category ORDER BY 2 DESC;"
```

## Next steps

1. Name the project and its modules.
2. Decide the `mv` comment format, or decide to keep doing deletes only.
3. Capture the baseline.
4. Build the new project: copy data, move code into modules, no behavior
   changes. Verify against the baseline.
5. Only then: identity ledger, then `mv`, then editing.

Push `0ad24bd` whenever you are ready; it is committed but not pushed.

## Loose ends from before, still open

- **13 `delete` actions sit at `failed`**, which is terminal — nothing retries
  them. May be fine, may be work left undone. Worth a look.
- **Trash has never been emptied.** The db holds the record three ways
  (`notes`, `actions`, `fotos.status`).
- **`recon/recon.log` is untracked and not in `.gitignore`** (which covers
  `slideshow.log` only). Pick one.
- **`<kbd>` in README** — renderer-dependent raw HTML, worth swapping for
  backticks.
- **No test framework.** The baseline table above is the closest thing.
- **Reading archived docs:** to stop them being consulted as if current, add
  `"deny": ["Read(./recon/history/**)"]` to `.claude/settings.json`. A
  `CLAUDE.md` line helps humans but does not enforce anything. Neither has been
  done.

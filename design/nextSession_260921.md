# Next session — the new project

Written 2026-09-21. Scope: **how the new project is organized and where to
start.** Outstanding issues with the current code are deliberately left out —
they are rediscoverable. The previous handoff, `docs/nextSession.md`, is kept
for reference and has the full detail.

Paste this when you come back:

▎ Read docs/nextSession_260921.md. We are creating the new combined project.

---

## The idea in one paragraph

Today `photos` (builds the catalog) and `slideshow` (views it, and also
contains the code that destroys files) are two repos, and the boundary between
them doesn't match what the code actually does. The new project is **one repo,
four directories**, where each directory's write rights are stated and
obvious. Nothing about the data model changes.

## The layout

```
<project>/                 one git repo, one .claude, one README
  README.md                big picture: the actors, the order of operations
  lib/                     Deno/TS shared by curate + slideshow only
  collect/                 builds the catalog — owns `fotos`   (was: photos)
  dbase/                   schema + database docs — no runtime
  slideshow/               viewer — only ever INSERTs into `notes`
  curate/                  notes -> actions -> execution        (was: recon)
    history/               archived migration SQL
```

Params live per module: `slideshow/params_slideshow.json`,
`curate/params_curate.json`. None for `collect` (nothing there reads one).
Images and the database stay **outside** the repo, as they do today.

## The write rule — the reason for the whole exercise

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| collect | create/populate | — | — | reads |
| curate | `status`, `path`/`name` | insert/delete `missing` | insert, update | **moves/destroys** |
| slideshow | read | insert | — | reads |
| dbase | schema only | | | |

`curate` gets its own top-level directory precisely because it is the only
thing that touches files destructively. That should be visible.

## Decided this session

- **Module names**: `collect`, `dbase`, `slideshow`, `curate`. The verbs make
  the write rule nearly self-evident.
- **`dbase` is not an actor** — no runtime, no params file. It holds
  `createTables.sql` and the database documentation, which is the one document
  both sides depend on.
- **`lib/` is the TS modules' library, not the project's.** `collect` is
  zsh/python and shares nothing. Say so in the root README so its absence does
  not read as an oversight. Unifying the runtimes is deferred indefinitely.
- **Project name**: `pwv_photos` now, renamed to `photos` once the current
  `photos` is obsolete. The rename is three steps, no code changes —
  `UPDATE fotos SET path = replace(...)`, two or three params values, and
  renaming the `~/.claude/projects/-…` directory. Written up in
  `docs/photo_port.md`.
- **Run each module from its own directory.** `slideshow.ts:162` serves
  `./static/…` and `logger.ts:1` writes `slideshow.log`, both cwd-relative, and
  a relative `dataDir` follows cwd too. State the rule in each module README;
  logs then land per-module for free. (Resolving from `import.meta.url`
  instead would remove the constraint — a code change, so after the refactor,
  not during.)
- **`dataDir` becomes absolute.** Removes the cwd hazard from the one script
  that moves files to trash.

## Still open — decide early, they shape the layout

1. **The project name.** `pwv_photos` is a placeholder you have agreed to.
2. **Does `createTables.sql` belong to `dbase` or `collect`?** `collect` owns
   the table; `dbase` documents it.
3. **Where the database documentation lives** — `dbase/` or a top-level
   `docs/`. Related to 2.
4. **Case convention.** Pick all-lowercase for directories and filenames and
   stop thinking about it.
5. **`history/`** under `curate/` (its actual origin) rather than top level,
   where it will attract unrelated junk.

## Where to start

1. **Create the folder structure** in the new root, with a `README.md` stub in
   each module. Empty directories and stub READMEs are the whole first step.
2. **`git init`**, fresh. New `.claude/`. New root `README.md`.
3. **Start Claude Code in the new root.** History and memory are keyed to the
   project's absolute path, so the new project gets its own — this session's
   memory does not follow. Copy across what still applies.
4. **Move the outline** (this file, or the parts of it that survive) into the
   new project's README as the starting point, and work from there.
5. Then, in dependency order, **no behavior changes**:
   `images → database → slideshow → curate`.
   Each step verified against the baseline before the next begins.

Most of the current `CLAUDE.md` is still true and splits cleanly along the
module lines — the schema section, the write rules, the gotchas. Salvage it
per-module rather than rewriting. The root README is the genuinely new part,
because the big picture is what changed.

**Refactor first, verify, then change the schema, then add features.** Do not
start with the interesting parts.

## Baseline — what "it works" means

Check these after each move; they are the closest thing to a test suite.

| | |
|---|---|
| live `fotos` rows (`status='ok'`) | 7,269 |
| rows with missing md5 | 0 |
| distinct md5 / duplicate groups | 7,260 / 9 |
| `delete` actions done / failed | 1,949 / 13 |
| pending actions | 0 |
| `notes` rows | 0 |
| files under `images3/` | 7,278 |

Plus: `findMissing.ts` reporting 0 changes, and the viewer loading its usual
image count.

## Laptop port — in progress, unrelated to the above

`docs/photo_port.md` is the full procedure. Status as of this writing:

- `photos/` copied to the laptop — 22.2 GB, 7,397 files.
- `slideshow/` **not** copied — the rsync failed on the password prompt. Rerun.
- Steps 3–5 not started: Claude state, the `fotos.path` `UPDATE` for the
  `mac24` → `m4book` username change, and verification. **Nothing on the
  laptop will work until step 4 is done.**

## Pointers

| | |
|---|---|
| `docs/nextSession.md` | the previous handoff — full detail, kept for reference |
| `docs/photo_port.md` | moving a working copy to another machine |
| `docs/reconcile.md` | notes → actions → execution, end to end |

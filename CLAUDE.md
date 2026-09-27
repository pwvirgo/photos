# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Local project for cataloging and curating a personal photo library. Images
live outside this repo, on disk. One SQLite database (`photos3.db`) is
shared by every part of the project.

The live database and images are at `photos_old/photos3.db` and
`photos_old/images3` (outside this repo) — `slideshow` and `curate`'s params
files point there directly. `dbase/create_tables.sql` has never been run to
build a database from scratch, and `collect` hasn't been re-run from this
repo location yet.

## The four modules

Each has a stated write scope. This is the reason the project is organized
this way — see each module's own README for detail.

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| `collect` | create/populate | — | — | reads |
| `dbase` | schema only | — | — | — |
| `slideshow` | read | insert | — | reads |
| `curate` | `status`, `path`/`name` | insert/delete `missing` | insert, update | **moves/destroys** |

- **`collect/`** (`collect/README.md`) — zsh + Python + plain SQL. Scans
  image files with ExifTool, computes MD5s, populates `fotos`. Shares
  nothing with the Deno/TS code below; not a policy exception to that, just
  a different runtime that was never worth unifying.
- **`dbase/`** (`dbase/README.md`) — not a runtime actor. Holds the schema
  (`create_tables.sql`) and the database-access code (`db.ts`: open/query/
  insert routines) that `slideshow` and `curate` import — no other module
  embeds its own SQL against `fotos`/`notes`/`actions`. That rule is about
  app code, not about you: hand-run `sqlite3` for path fixes, note pruning,
  or schema changes is a separate, expected channel (same as
  `curate/notesToActions.sql` already is).
- **`slideshow/`** (`slideshow/README.md`) — Deno HTTP server + vanilla JS
  frontend. Displays the catalog fullscreen, auto-advances, lets you
  annotate images with notes. Only ever **inserts** into `notes`.
- **`curate/`** (`curate/README.md`) — notes → actions → execution. The
  only code that moves or destroys a file. `findMissing.ts` (bulk
  missing-file scan) and `executeDeletions.ts` (moves files to trash, soft-
  deletes the `fotos` row) both default to a dry run; nothing changes until
  `--execute`. Full pipeline detail: `curate/README.md`.

`lib/` (`lib/README.md`) is cross-cutting Deno/TS utilities — `params.ts`,
`logger.ts` — shared by `slideshow` and `curate` only.

## Running things

Run each module from its own directory — `slideshow.ts` serves `./static/*`
relative to cwd, and both `curate` scripts and `logger.ts` write their log
file relative to cwd too. See each module's README for the exact command;
in short:

```bash
cd slideshow && deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_slideshow.json
cd curate && deno run --allow-read --allow-write findMissing.ts --params=params_curate.json [--execute] [--limit N] [--verbose]
cd curate && deno run --allow-read --allow-write executeDeletions.ts --params=params_curate.json [--execute] [--limit N] [--verbose]
```

Params are per-module (`slideshow/params_slideshow.json`,
`curate/params_curate.json`), not shared — one file currently naming both a
read-only viewer and the code that destroys files was the reason for the
split. `collect` reads no params file today.

There is no test framework or linter configured. `curate`'s dry-run mode is
the closest thing to a test — always dry-run before `--execute`, and when
testing a destructive path for real, run it against exactly one row
(`--limit 1 --execute`) before trusting a full batch run.

## Database Schema

Three tables, one view, defined in `dbase/create_tables.sql`:

- `fotos` — `img_id` (PK), `path`, `name`, `status`
  (`CHECK(status IN ('ok','deleted'))`), `bytes`, `dt_taken`, `dt_created`,
  `camera`, `lens`, `lat`, `lon`, `img_size`, `duration`, `md5`. Deletion is
  the row stays, only `status` changes to `'deleted'`.
- `notes` — `note_id` (PK), `category` (free text), `rank`
  (`CHECK(rank IN (1..5))`), `comment`, `img_id` (FK), `note_dt`. Written by
  the slideshow Notes form and by missing-file detection
  (`category='missing'`, `rank=5`).
- `actions` — `action_id` (PK), `action` (`CHECK` one of
  `mv/delete/rotate/resize/crop/edit/other`), `info`, `request_dt`,
  `status_dt`, `status` (`CHECK` one of `done/pending/failed/gone`), `img_id`
  (FK). `curate/notesToActions.sql` sets `info` to the note's comment
  verbatim; `executeDeletions.ts` sets `status='gone'` and appends
  `' | file gone'` when the file was already missing — `'failed'` is
  reserved for a genuine execution failure (move or DB error), not this
  case.
- `v_notes` — view: `notes` LEFT JOIN `fotos`, exposing note fields plus
  `status`, `path`, `name`, `full_path`, `md5`. Read helper, nothing writes
  through it.

`node:sqlite` enforces foreign keys by default; `openDb()` (`dbase/db.ts`)
turns them **off** on purpose, so `notes`/`actions` rows can outlive a
a `fotos` row whose `status` is `'deleted'` as an audit trail.

**`img_id` is the fragile part.** `notes` and `actions` identify images by
`img_id` alone. If the catalog is ever rebuilt and ids change, every row in
both tables silently points at the wrong image. A rebuild is not routine —
see `dbase/history/migrate.sql` for the worked example from the last one
(841-row re-match on path+name).

## Configuration

Each Deno/TS module's params file (loaded via `lib/params.ts`):

- `imageFolderPath` — the shared image root. `fotos.path` stores absolute
  paths, served/checked as-is; this is used as the unmounted-volume guard
  and, in `curate`, the root for the missing-file scan.
- `dataDir` + `dbName` — combined by `dbFile()` into the db path.
  **Absolute**, not relative — a relative `dataDir` silently follows the
  process's cwd, not the project root, which matters once these files live
  one level down in per-module directories.
- `trashDir` — where `curate/executeDeletions.ts` moves deleted files;
  defaults to `<dataDir>/trash`. Must be on the same volume as the images
  (uses rename).
- `whereClause` / `orderBy` — SQL fragments for `slideshow`'s image query
  only; `curate`'s scripts scan every `status='ok'` row regardless.
  Read-only fragments only — `checkSqlFragment()` rejects `;`.

## Gotchas

**SQLite / Deno column case:** `node:sqlite` keys result rows by the
column's *declared* case. The schema declares `md5` lowercase, but queries
keep the `MD5 AS md5` alias (as `getImageInfo()` in `dbase/db.ts` does) and
code accesses `row.md5` — stays correct if the column is ever declared
`MD5` again.

**TIFF detection:** the `file` command misidentifies many valid JPEGs as
TIFF, because JPEG EXIF metadata uses TIFF format internally. To reliably
detect a true TIFF, check magic bytes: JPEG starts `FF D8`; TIFF starts
`49 49 2A 00` (little-endian) or `4D 4D 00 2A` (big-endian). In Python:
`magic = open(path,'rb').read(4); is_tiff = magic[:2] != b'\xff\xd8' and magic[:4] in (b'\x49\x49\x2a\x00', b'\x4d\x4d\x00\x2a')`.
`sips -s format jpeg "$f" --out "$f"` converts TIFF to JPEG in place.

**A folder rename breaks `fotos.path`.** Renaming the folder holding the
images or the db leaves every stored path stale, silently — nothing errors,
`curate/findMissing.ts` just starts reporting every image as missing. Fix with a one-time
`UPDATE fotos SET path = replace(path, '<old>', '<new>')`, verify
`still_old = 0`, then re-run `findMissing.ts` as a dry run to confirm 0
changes before trusting anything else. Same fix applies to porting to
another machine.

## Naming Conventions

Use "params" (not "config") throughout.

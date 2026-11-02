# CLAUDE.md

Guidance for Claude Code when working in this repository.

Don't make changes unless requested. Discussion is not an invitation to start
fixing — raising issues and clarifications is fine.

## Project

See `README.md` for the module layout. Each module has its own `README.md`
with detail.

## Write scope

The reason for the module split. No module trespasses on another's scope.
`prov` has two writers: the user one photo at a time in slideshow's E form,
and `dbase/snips` scripts in bulk. (`dbase/db.ts` also holds the routines the
other modules call; the table says who *initiates* each write.)

| Module | `fotos` | `notes` | `prov` | `actions` | files on disk |
|---|---|---|---|---|---|
| `collect` | create/populate | — | — | — | reads |
| `dbase` | schema | — | insert, update (`snips/` scripts, e.g. `prov_bulk.ts`) | — | — |
| `slideshow` | read | insert | insert, update, delete (user, E form) | — | reads |
| `curate` | `status`, `path`/`name` | insert/delete `missing` | — | insert, update | **moves/destroys** |

## Running

Run each module from its own directory — several scripts resolve paths
relative to cwd (`slideshow` serves `./static/*`; each module writes its
own log file — `lib/logger.ts` names it after the module — to cwd). Exact commands live in each
module's own `README.md`.

## Fragile bits

- **`img_id`** — `notes` and `actions` reference images only by `img_id`.
  Rebuilding the catalog changes ids and silently mispoints every row. Not
  routine; see `dbase/history/1_migrate.sql` for the worked example.
- **`curate` is the only destructive module.** Always dry-run first; when
  testing a destructive path for real, use `--limit 1 --execute` on one row
  before trusting a full batch.

## Naming

Use "params", not "config".

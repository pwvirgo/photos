# CLAUDE.md

Guidance for Claude Code when working in this repository.

Don't make changes unless requested. Discussion is not an invitation to start
fixing — raising issues and clarifications is fine.

## Project

See `README.md` for the module layout. Each module has its own `README.md`
with detail.

## Write scope

The reason for the module split. No module trespasses on another's scope.

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| `collect` | create/populate | — | — | reads |
| `dbase` | schema only | — | — | — |
| `slideshow` | read | insert | — | reads |
| `curate` | `status`, `path`/`name` | insert/delete `missing` | insert, update | **moves/destroys** |

## Running

Run each module from its own directory — several scripts resolve paths
relative to cwd (`slideshow` serves `./static/*`, `curate` and
`lib/logger.ts` write log files to cwd). Exact commands live in each
module's own `README.md`.

## Fragile bits

- **`img_id`** — `notes` and `actions` reference images only by `img_id`.
  Rebuilding the catalog changes ids and silently mispoints every row. Not
  routine; see `dbase/history/migrate.sql` for the worked example.
- **`curate` is the only destructive module.** Always dry-run first; when
  testing a destructive path for real, use `--limit 1 --execute` on one row
  before trusting a full batch.

## Naming

Use "params", not "config".

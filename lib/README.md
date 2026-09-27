# lib/

Cross-cutting Deno/TS utilities shared by `slideshow` and `curate` — nothing
here touches the database. Database access (schema, queries, inserts) lives
in `dbase/`; see `dbase/README.md`. `collect` is zsh/Python and shares
nothing with this directory; its absence from `collect/` is intentional, not
an oversight.

## Files

- **`params.ts`** — loads and validates a params file. `Params`,
  `ParamsError`; `loadParams()`, `paramsPathFromArgs()`,
  `noParamsFileMessage()`, `dbFile()` (builds the db path from `dataDir` +
  `dbName`).

- **`logger.ts`** — four-level logger (`DEBUG`/`INFO`/`WARN`/`ERROR`), writes
  to both console and a log file, level changeable at runtime.

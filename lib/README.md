# lib/

Cross-cutting Deno/TS utilities shared by `slideshow` and `curate` — nothing
here touches the database. Database access (schema, queries, inserts) lives
in `dbase/`; see `dbase/README.md`. `collect` is zsh/Python and shares
nothing with this directory; its absence from `collect/` is intentional, not
an oversight.

## Files

- **`params.ts`** — loads and validates params: the shared
  `params_shared.json` at the project root (`dbDir`, `dbName`, `trashDir` —
  the same for every module) merged with the module's own file named by
  `--params`. `Params`, `ParamsError`, `SHARED_PARAMS_FILE`; `loadParams()`,
  `paramsPathFromArgs()`, `noParamsFileMessage()`, `dbFile()` (builds the db
  path from `dbDir` + `dbName`).

- **`logger.ts`** — four-level logger (`DEBUG`/`INFO`/`WARN`/`ERROR`), writes
  to the console and to a log file named after the module being run
  (`curate.log`, `slideshow.log`) in the current directory, level changeable
  at runtime.

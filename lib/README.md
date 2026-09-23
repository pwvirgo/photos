# lib/

Cross-cutting Deno/TS utilities shared by `slideshow` and `curate` — nothing
here touches the database. Database access (schema, queries, inserts) lives
in `dbase/`; see `dbase/README.md`. `collect` is zsh/Python and shares
nothing with this directory; its absence from `collect/` is intentional, not
an oversight.

These files are a straight copy of the old `slideshow/lib/`, taken at this
project's creation. They haven't yet been re-verified against a running
`slideshow/` or `curate/` module here.

## Files

- **`params.ts`** — loads and validates a params file. `Params`, `Source`,
  `ParamsError`; `loadParams()`, `paramsPathFromArgs()`,
  `noParamsFileMessage()`, `sourceMismatch()` (reports when a file's `source`
  doesn't match the mode a program requires), `dbFile()` (builds the db path
  from `dataDir` + `dbName`).

- **`logger.ts`** — four-level logger (`DEBUG`/`INFO`/`WARN`/`ERROR`), writes
  to both console and a log file, level changeable at runtime.

- **`scanner.ts`** — folder-mode image discovery. Tied to `source: "folder"`,
  which the design docs record as slated to go away (not done yet) — its
  place in this shared library may be temporary.

# photos

A local project for cataloging and curating a personal photo library.

Images and database live outside this repo, on disk. One SQLite database (`photos3.db`)
is shared by every part of the project — everything here reads or writes
that one database plus the image files it points at.

## Quick start

Run each module from its own directory — see that module's README for the
full picture.

```bash
# View and annotate the catalog
cd slideshow && deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_slideshow.json

# Sync missing-file flags, then stage and execute deletes from notes
cd curate && deno run --allow-read --allow-write findMissing.ts --params=params_curate.json
cd curate && deno run --allow-read --allow-write executeDeletions.ts --params=params_curate.json
```

Both `curate` commands default to a dry run — add `--execute` once you've
checked the output. `collect` has no single entry point; see
`collect/README.md` for its scan → hash → load pipeline.

## The actors

Four modules, each with a stated write scope:

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| `collect` | create/populate | — | — | reads |
| `dbase` | schema only | — | — | — |
| `slideshow` | read | insert | — | reads |
| `curate` | `status`, `path`/`name` | insert/delete `missing` | insert, update | **moves/destroys** |

- **`collect`** scans the image files, extracts metadata, and populates the
  `fotos` table. This and the curate module are the only modules that ever change the contents of the fotos table. 
- **`dbase`** isn't a policy actor — it doesn't decide what gets written. It
  holds the schema (`create_tables.sql`) and the database-access code
  (`db.ts`: open/query/insert routines) that `slideshow` and `curate` call
  through, so no other module embeds its own SQL. See `dbase/README.md`.
- **`slideshow`** displays the catalog and lets you annotate images. It only
  ever inserts into `notes`.
- **`curate`** turns notes into staged `actions` and executes them —
  deletions move files to a trash folder and set `fotos.status = 'deleted'`
  (the row stays, only `status` changes; the exception above). It is the only code that touches a
  file destructively.

`lib/` is Deno/TS code shared by `slideshow` and `curate` only — `collect` is
zsh/Python and shares nothing with it. See `lib/README.md`.

## Status

All four modules exist and have code. `slideshow` and `curate` run against
the live database at `photos_old/photos3.db` / `photos_old/images3` — no
copy lives inside this project. `dbase/create_tables.sql` has never been run
to build a fresh database, and `collect` hasn't been re-run from this repo
location yet (see `collect/README.md`'s Status).

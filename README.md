# photos

A local project for cataloging and curating a personal photo library.

Images live outside this repo, on disk. One SQLite database (`photos3.db`)
is shared by every part of the project — everything here reads or writes
that one database plus the image files it points at.

This is a fresh start of what used to be two separate repos (`photos` and
`slideshow`). See "Status" below for what actually exists today.

## The actors

Four modules, each with a stated write scope:

| Module | `fotos` | `notes` | `actions` | files on disk |
|---|---|---|---|---|
| `collect` | create/populate | — | — | reads |
| `dbase` | schema only | — | — | — |
| `slideshow` | read | insert | — | reads |
| `curate` | `status`, `path`/`name` | insert/delete `missing` | insert, update | **moves/destroys** |

- **`collect`** scans the image files, extracts metadata, and populates the
  `fotos` table. Nothing else in this project ever inserts, updates, or
  deletes a `fotos` row — with one exception below.
- **`dbase`** isn't a policy actor — it doesn't decide what gets written. It
  holds the schema (`create_tables.sql`) and the database-access code
  (`db.ts`: open/query/insert routines) that `slideshow` and `curate` call
  through, so no other module embeds its own SQL. See `dbase/README.md`.
- **`slideshow`** displays the catalog and lets you annotate images. It only
  ever inserts into `notes`.
- **`curate`** turns notes into staged `actions` and executes them —
  deletions move files to a trash folder and set `fotos.status = 'deleted'`
  (a soft delete; the exception above). It is the only code that touches a
  file destructively.

`lib/` is Deno/TS code shared by `slideshow` and `curate` only — `collect` is
zsh/Python and shares nothing with it. See `lib/README.md`.

## Status

This project is a fresh start. All four modules exist now, moved over from
`photos_old` (the old `photos` and `slideshow` projects): `slideshow` boots
and shows the same 18-image baseline recorded in the design docs; `curate`'s
scripts run clean dry runs against the live db; `collect` is copied over but
not yet re-run from this location — see `collect/README.md`'s Status. Only
`dbase` and `collect`'s schema-creation path have never actually been
exercised together (the only database in use so far is `photos_old`'s
existing one, read in place — `create_tables.sql` hasn't been run to build a
fresh one).

`slideshow` and `curate` both point straight at `photos_old/photos3.db` and
`photos_old/images3` — no copy lives inside this project. There's a live
proposal to move images, the database, and backups of both into one external
folder outside every project and delete `photos_old` entirely; see
`slideshow/README.md`'s open questions.

`design/` holds the full planning history:

- `nextSession_260921.md` — the current plan for this layout, most recent
- `nextSession.md` — the earlier, more detailed handoff (context for the above)
- `reconcile.md` — the notes → actions → execution pipeline, end to end
- `photo_port.md` — moving a working copy to another machine

Still open, per `design/nextSession_260921.md`: the project's final name
(currently just `photos`) and directory/file case convention. (Whether the
schema SQL belongs to `dbase` or `collect` has been settled by action:
`create_tables.sql` lives in `dbase/`.)

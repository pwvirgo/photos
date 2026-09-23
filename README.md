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

This project is a fresh start. `dbase/`, `lib/`, and `slideshow/` exist with
real, working code moved over from the old `slideshow` project — the viewer
boots and shows the same 18-image baseline recorded in the design docs.
`collect` and `curate` haven't been created yet. `collect` can't call into
`dbase/db.ts` directly since it's zsh/Python, not Deno/TS — see the open
question below.

`slideshow/`'s `photos3.db` currently lives in `dbase/` as a copy of
`photos_old/photos3.db` — a stopgap, not a second source of truth. There's a
live proposal to move images, the database, and backups of both into one
external folder outside every project and delete `photos_old` entirely; see
`slideshow/README.md`'s open questions.

`design/` holds the full planning history:

- `nextSession_260921.md` — the current plan for this layout, most recent
- `nextSession.md` — the earlier, more detailed handoff (context for the above)
- `reconcile.md` — the notes → actions → execution pipeline, end to end
- `photo_port.md` — moving a working copy to another machine

Still open, per `design/nextSession_260921.md`: the project's final name
(currently just `photos`), whether the schema SQL belongs to `dbase` or
`collect`, and directory/file case convention. Not re-litigated here —
see that file.

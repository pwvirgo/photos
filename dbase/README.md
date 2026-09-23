# dbase/

Everything about the database in one place: the schema, and the routines
that create, query, and modify it. `collect`, `slideshow`, and `curate` are
meant to reach the database only through here — no other module embeds its
own SQL.

That rule is about the *app code*, not about hand-run SQL by you as the
DBA — ad-hoc `sqlite3` sessions to fix a path, prune notes, or evolve the
schema are a separate, expected channel, same as `recon/notesToActions.sql`
already is a hand-run script outside the app's code paths.

## Files

- **`create_tables.sql`** — schema: `fotos`, `notes`, `actions`, and the
  `v_notes` view. Copied from the old `photos` project as a starting point;
  not yet re-verified against a running module here.

- **`db.ts`** — SQLite interface (Deno's `node:sqlite`), moved from `lib/`.
  `openDb()` / `openDbReadOnly()`; `queryImages()` (takes a db path, not a
  handle; runs on a read-only connection and wraps the query so
  `status='deleted'` rows are never visible); `getImageInfo()`;
  `insertNote()` / `insertAction()` (parameterized inserts);
  `hasMissingNote()` / `deleteMissingNotes()`; `fileExists()`. `openDb()`
  turns foreign keys off on purpose, so `notes` / `actions` rows can outlive
  a soft-deleted `fotos` row. Imports `logger` from `../lib/logger.ts`.

`collect` is zsh/Python and can't import `db.ts` directly — until that's
settled, it keeps writing its own SQL/Python for schema creation and
population (see the open question in the root README).

## Gotcha

Deno's `node:sqlite` keys result rows by the column's declared case. The
database declares `md5` lowercase, but queries keep the `MD5 AS md5` alias
(as `getImageInfo()` does) and code accesses `row.md5` — so it stays correct
if the column is ever declared `MD5` again.

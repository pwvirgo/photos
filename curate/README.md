# curate/

Curating the photo library: making changes to the collectiopn of image files and the databse that documents them.

At this time the only changes deletions. In the furure there will be more actions.

The events are:
-  decide what to change and record that in the fotos.notes table.

-  Check the db and images for completness and accuracy
-  Populate the actions table from the notes table
-  make the changes to the images and the db


Nothing here happens automatically and nothing is a single step — a deletion passes through three tables and several CLI programs.

`curate` is the only code in this project that touches a file destructively.
It owns `actions`, and shares write access to `notes` (with `slideshow`) and
`fotos` (the exception: it sets `status`/`path`/`name`, everything else
belongs to `collect`). See the root `README.md`'s write-rule table.

## The pipeline

1. **Notes** — you mark images `delete` in `slideshow`, or
   `findMissing.ts` flags files that vanished from disk (`category='missing'`).
2. **Actions** — `notesToActions.sql` turns `delete` notes into pending
   `actions`. `missing` notes are ignored; promoting one to `delete` is a
   manual step.
3. **Execution** — `executeDeletions.ts` moves the file to `trashDir`, marks
   `fotos.status='deleted'` and the action `done`, in one transaction.

Both scripts default to a dry run; nothing changes until `--execute`.

## Files

| File | Role |
|------|------|
| `findMissing.ts` | Bulk missing-file scan. Writes only `notes`. |
| `notesToActions.sql` | Staging. `notes` → pending `actions`. |
| `executeDeletions.ts` | Execution. Moves files, writes `actions` and `fotos.status`. |
| `validate.ts` | Read-only audit: done deletes vs. `fotos.status`, deleted rows vs. files on disk, live rows vs. files on disk. Writes nothing, not even a log — reads straight off stdout. |
| `params_curate.json` | This module's params, pointed at `photos_old`'s live db and images — same data `slideshow` uses, no second copy. |
| `curate.log` | Append-only log, written by `findMissing.ts` and `executeDeletions.ts`, in this directory. |
| `history/migrate.sql` | Archived migration SQL from an earlier db rebuild. Reference only. |

Imports come from `../lib/` (`params.ts`, `logger.ts`) and `../dbase/db.ts`
(open/query/insert routines) — `curate` never writes its own ad-hoc SQL
against `fotos`/`notes`/`actions` outside those.

## Commands

Run from **this directory** — `findMissing.ts` and `executeDeletions.ts`
write `curate.log` relative to the current directory.

```bash
PARAMS=params_curate.json
DB=/Users/mac24/a/projects/photos_old/photos3.db

# 1. Sync the missing-file flags (dry run, then apply)
deno run --allow-read --allow-write findMissing.ts --params=$PARAMS
deno run --allow-read --allow-write findMissing.ts --params=$PARAMS --execute

# 2. See what is pending
sqlite3 -init /dev/null -batch $DB \
  "SELECT action, status, COUNT(*) FROM actions GROUP BY action, status;"

# 3. Execute pending deletes — dry run, one image, then the rest
deno run --allow-read --allow-write executeDeletions.ts --params=$PARAMS
deno run --allow-read --allow-write executeDeletions.ts --params=$PARAMS --execute --limit 1
deno run --allow-read --allow-write executeDeletions.ts --params=$PARAMS --execute

# 4. Stage new deletes from notes
sqlite3 -init /dev/null -batch $DB < notesToActions.sql

# 5. Audit the three invariants (read-only, no log file, no --execute)
deno run --allow-read validate.ts --params=$PARAMS
```

Staging (`notesToActions.sql`) refuses to run while any `delete` action is
still `pending` — step 3 has to clear the queue first. Both scripts take
`--verbose` and `--limit N`.

## Undoing a deletion

Possible by hand until you empty the trash:

```bash
mv "<trashDir>/<stem>_<img_id><ext>" "<fotos.path>/<name>"
```

```sql
UPDATE fotos   SET status = 'ok' WHERE img_id = <img_id>;
UPDATE actions SET status = 'failed', status_dt = datetime('now'),
       info = COALESCE(info || ' | ', '') || 'undone'
 WHERE img_id = <img_id> AND action = 'delete' AND status = 'done';
```

## `img_id` is the fragile part

`notes` and `actions` identify images by `img_id` and nothing else. If the
catalog is ever rebuilt and ids change, every row in both tables silently
points at the wrong image. A rebuild is not routine — see
`history/migrate.sql` for the worked example from the last one.

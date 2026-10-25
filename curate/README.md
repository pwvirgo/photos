# curate/

Curating the photo library: making changes to the collection of image files
and to the database that documents them.

At this time the only change is deletion. In the future there will be more
actions.

`curate` is the only code in this project that touches a file destructively.
It owns `actions`, and shares write access to `notes` (with `slideshow`) and
`fotos` (the exception: it sets `status`/`path`/`name`, everything else
belongs to `collect`). See the root `README.md`'s write-rule table.

## The pipeline

Nothing here happens automatically and nothing is a single step — a deletion
passes through three tables (`notes`, `actions`, `fotos`) and several CLI
programs.

Run everything from **this directory**: the scripts write `curate.log`
relative to the current directory. The commands below use:

```bash
DB=~/a/projects/photos_now/photos4.db
DB=<dbDir>/<dbName>       
```

The `.ts` scripts take no `--params` file; they find the db through
`../params_shared.json` themselves;
`$DB` is only for the `sqlite3` commands, so keep the two pointing at the
same file.

`validate.ts` (for its note changes) and `executeDeletions.ts` default to a dry run — nothing
changes until `--execute`. Both take `--verbose` (a line per image) and
`--limit N`.

### 1. Decide what to delete

Every deletion starts as a row in `notes` with `category='delete'`. From
there it moves through the tables:

| Stage | What is written |
|---|---|
| decide (this step) | `notes.category='delete'` |
| stage (step 3) | `actions`: `action='delete'`, `status='pending'` |
| execute (step 4) | file moved to the trash folder, `actions.status='done'`, `fotos.status='deleted'` |

To make a delete note, mark the image `delete` in the `slideshow` app, or
insert the row from the terminal. The note's `comment` is carried into
`actions.info` (several delete notes on one image are joined with ` | `).

**Files deleted by hand** (outside this pipeline) take a variation. Such a
file is flagged with a note of `category='missing'` — written by `slideshow`
when it tries to show the image, or in bulk by `validate.ts --execute` (step 2).
A `missing` note is a flag for a person, not an instruction: staging ignores
it, and nothing turns it into an action automatically. To record the
deletion, promote the note to `delete` yourself:

```sql
UPDATE notes SET category = 'delete'
 WHERE category = 'missing' AND img_id = <img_id>;
```

It then goes through steps 3 and 4 like any other delete. Because there is
no file to move, the action ends as `action='delete'`, `status='gone'`
rather than `done`; `fotos.status` becomes `'deleted'` either way.

### 2. Check the db and the images

Before staging anything, confirm the db and the disk agree. `validate.ts` audits three invariants and
changes nothing:

1. done/gone delete actions and `fotos.status='deleted'` rows agree 1 to 1
2. every `deleted` row has no file on disk
3. every live row has a file on disk

```bash
deno run --allow-read --allow-write validate.ts
```

Exit code 0 if all three pass, 1 otherwise.

After the checks it reports on the `missing` notes: which `status='ok'` rows
would get a note (`category='missing'`, file has vanished) and which notes
would be removed (file is back). By default nothing is changed. `--execute`
applies those note changes. It writes only `notes`, and never changes the
PASS/FAIL result or exit code — Check 3 still reports a flagged file, marked
`(flagged)`. `--limit N` caps how many note changes `--execute` applies (the
checks are never capped; `--limit` is an error without `--execute`) and
`--verbose` adds a line per change. Review what it flags and decide (step 1)
whether any should become deletions.

```bash
deno run --allow-read --allow-write validate.ts
deno run --allow-read --allow-write validate.ts --execute
```

### 3. Stage the actions

`notesToActions.sql` turns `delete` notes into pending `actions`, one per
image however many delete notes it has. An image that already has a pending
delete action is skipped. `notes` is not modified.

```bash
sqlite3 -init /dev/null -batch $DB < notesToActions.sql
```

See what is queued:

```bash
sqlite3 -init /dev/null -batch $DB \
  "SELECT action, status, COUNT(*) FROM actions GROUP BY action, status;"
```

### 4. Execute the deletions

`executeDeletions.ts` moves each file to `trashDir` as
`<stem>_<img_id><ext>`, and in one transaction sets `fotos.status='deleted'`
and the action to `done`. If the file is already gone, the row is still
marked `deleted` and the action becomes `gone`. `trashDir` comes from
`../params_shared.json` (default `<dbDir>/trash`).

Dry run, then one image, then the rest:

```bash
deno run --allow-read --allow-write executeDeletions.ts
deno run --allow-read --allow-write executeDeletions.ts --execute --limit 1
deno run --allow-read --allow-write executeDeletions.ts --execute
```

Emptying the trash is a separate, manual step.

### 5. Check again

Re-run `validate.ts` (step 2). All three checks should pass.

## Undoing a deletion

Possible by hand until you empty the trash (a `gone` deletion had no file to
move, so there is nothing to restore):

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
`dbase/history/1_migrate.sql` for the worked example from the last one.

## Files

| File | Role |
|------|------|
| `validate.ts` | Audit (read-only unless `--execute`): done/gone deletes vs. `fotos.status` (1 to 1, both directions), deleted rows vs. files on disk, live rows vs. files on disk. `--execute` also keeps the `missing` notes in step with the disk (writes only `notes`). |
| `notesToActions.sql` | Staging. `notes` → pending `actions`. |
| `executeDeletions.ts` | Execution. Moves files, writes `actions` and `fotos.status`. |
| `curate.log` | Append-only log in this directory, written by `validate.ts`, `notesToActions.sql` and `executeDeletions.ts`. |

Imports come from `../lib/` (`params.ts`, `logger.ts`) and `../dbase/db.ts`.

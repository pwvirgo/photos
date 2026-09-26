# Reconciliation

Curating the photo library: deciding which images to get rid of, recording that
decision, and carrying it out. Nothing here happens automatically and nothing
here is a single step — a deletion passes through three tables and two
hand-run programs before a file moves, and every stage leaves a record.

## Relationship to `../photos`

Two projects share one SQLite database.

- **`../photos` owns the `fotos` table.** It scans the image files, extracts
  metadata, and populates the catalog. Nothing in this project inserts,
  updates or deletes a `fotos` row — with one exception, below.
- **This project owns `notes` and `actions`.** Annotations you make in the
  slideshow, and the staged changes that come out of them.

The exception is the last step of a deletion, which sets `fotos.status` to
`'deleted'`. The row stays: only `status` changes, and `../photos` keeps
owning everything else about it.

## What it's for

1. You watch the slideshow and mark images — `delete`, or anything else you
   want to remember — as `notes`.
2. Marked images are staged as pending `actions`.
3. Pending actions are executed: the file moves to trash, the catalog row is
   marked deleted, the action is marked done.

Kept apart on purpose. A note is an opinion and can be wrong; an action is a
commitment; execution is the only thing that touches a file. A bad note can
never reach the filesystem without you running two more commands.

## Features

- **Nothing is ever deleted outright.** Files move to `trashDir`. You empty it
  by hand, whenever you are satisfied.
- **Dry run is the default.** Both scripts print exactly what they would do and
  change nothing until `--execute`.
- **Re-runnable after a crash.** Every file in trash is named
  `<stem>_<img_id><ext>`, so an interrupted run can prove a file in trash is
  that image's and finish the database half of the job.
- **The record survives the image.** Foreign keys are off on purpose
  (`PRAGMA foreign_keys = OFF` in `openDb()`), so `notes` and `actions` rows
  outlive the `fotos` rows they point at, even after `status` is set to `'deleted'`.
- **Unmounted-volume guard.** If the shared image root is not there, a run
  aborts having changed nothing, rather than concluding the whole library
  vanished.
- **Missing files are tracked in both directions** — flagged when a file goes
  away, unflagged when it comes back.
- **Everything is logged** to `recon/recon.log`, all three programs to the same
  file.

## Requirements

- Deno 2.x
- `sqlite3` on the path (for the staging step, which is plain SQL)
- A database-mode params file — `source` must be `"db"`, or the scripts refuse
  to run
- The image volume mounted

## Configuration

From your params file, only these four matter here:

| Field | Used for |
|-------|----------|
| `dataDir` + `dbName` | Which database. Combined by `dbFile()`. |
| `imageFolderPath` | The shared image root, checked once per run as the unmounted-volume guard. (Despite the name it is not folder-mode-only.) |
| `trashDir` | Where deleted files are moved. Defaults to `<dataDir>/trash`. **Must be on the same volume as the images** — the move is a rename. |

`whereClause` matters indirectly: it decides which images the slideshow shows
you, and therefore which ones you can mark. See "Reviewing before you stage".

## Data flow

```
  slideshow (N key)              recon/findMissing.ts
  category='delete'              category='missing'
          \                              /
           \                            /
            v                          v
                    notes
                      |
                      |  recon/notesToActions.sql
                      |  'delete' notes only; 'missing' ignored
                      v
                   actions  (action='delete', status='pending')
                      |
                      |  recon/executeDeletions.ts --execute
                      v
        file -> trashDir/<stem>_<img_id><ext>
        fotos.status = 'deleted'
        actions.status = 'done'
```

A `missing` note is a dead end by design: nothing promotes it. To act on a
missing file you mark it `delete` yourself, and it re-enters at the top.

## The pipeline

### 1. Notes

Two things write `notes`:

- **You, in the slideshow.** `N` opens the Notes form — category (free text,
  16 chars), rank (1-5), comment (1024 chars). One row per save. `category` is
  free text, but `delete` is the one word the staging step looks for, and it is
  matched case- and whitespace-insensitively.
- **Missing-file detection**, with `category='missing'` and `rank=5`. Either
  lazily, as the slideshow is about to show an image whose file has gone (one
  note per image, never duplicated), or in bulk via `recon/findMissing.ts`.

`findMissing.ts` sweeps every `status='ok'` row and syncs the flags **both
ways**:

| file on disk | has a `missing` note | what happens |
| --- | --- | --- |
| gone | no | one note added, comment ends `(scan)` |
| gone | yes | nothing |
| present | yes | the note is **deleted** — the file came back |
| present | no | nothing |

Clearing the note when a file reappears is deliberate. A `missing` note is a
cached observation, re-derivable by re-scanning — a stale one is worse than
none. The history stays in `recon/recon.log`, which records every insert and
delete.

The bulk scan exists because the lazy check only ever sees images the current
`whereClause` selects, so a file deleted outside that selection was never
noticed.

The `notes` table is not an archive. Prune it by hand when you like; `actions`
is what keeps the history.

### 2. Actions

`recon/notesToActions.sql` turns `delete` notes into pending actions.

- One action per image, however many `delete` notes it has.
- `info` is set to the note's **comment, verbatim** — no prefix, no note ids.
  Several notes' comments are joined with ` | `; if none carried a comment,
  `info` is `NULL`.
- Images that **already have a `delete` action are skipped**, whatever its
  status — `done`, `pending` or `failed`. So a note on a photo you already
  deleted does not re-stage it, and neither does re-running the script.
- Images with no `fotos` row are skipped.
- `missing` notes are ignored entirely.
- **It refuses to run while any action is still pending** — a guard table
  whose `CHECK` fails and rolls the whole thing back. Step 3 has to have
  cleared the queue first.

The notes themselves are never consumed or marked. Every past `delete` note is
therefore re-examined and re-skipped on every future run, so an established
library prints a lot of `SKIPPED` lines. That is noise, not a problem — nothing
is staged twice.

### 3. Execution

`recon/executeDeletions.ts` acts on every `action='delete'` with
`status='pending'`. Duplicate pending deletes for one image are removed first
(lowest `action_id` kept). Then, per image:

| situation | what happens |
| --- | --- |
| file present | moved to `<trashDir>/<stem>_<img_id><ext>`, then in **one transaction** `fotos.status='deleted'` and the action `done`. If that transaction fails the file is moved back. |
| file already in trash | an earlier run was interrupted after the move — just finishes the database update (`resumed`). |
| file already gone | `fotos.status='deleted'`, action `failed` with `file gone` added to `info` (` \| `-separated if it already carried a comment). |
| file in both places | reported as a conflict, left untouched. |

`failed` is terminal — only `pending` rows are ever retried — which is why the
trash names carry the `img_id`. Without the tag, a re-run could not tell this
image's file from another's and would record a deletion that in fact succeeded
as `file gone`. Trash names are ugly on purpose; the trash is disposable, the
`actions` table is not.

**If `imageFolderPath` is not there, the run aborts and changes nothing.** That
is the unmounted-volume case, checked once for the whole run. It deliberately
does *not* check each image's own folder: a folder you deleted yourself is a
file-gone, and its image is marked `deleted` like any other. (An earlier
version skipped those, which left their actions pending forever and blocked
staging from ever running again.)

Emptying `trashDir` is a separate manual step. Nothing in this project does it.

## Reviewing before you stage

To look at exactly what is about to be staged, point the slideshow at it —
set `whereClause` in your params file to:

```
img_id IN (SELECT img_id FROM notes WHERE LOWER(TRIM(category))='delete')
```

To hide flagged-missing images from the slideshow while you decide:

```
img_id NOT IN (SELECT img_id FROM notes WHERE LOWER(TRIM(category))='missing')
```

Hiding them also stops the per-slide check from ever reaching them, so the bulk
scan becomes the only thing that notices changes — the database is then only as
current as your last `findMissing.ts` run.

## Software

| File | Role |
|------|------|
| `recon/findMissing.ts` | Bulk missing-file scan. Writes only `notes`. |
| `recon/notesToActions.sql` | Staging. `notes` → pending `actions`. |
| `recon/executeDeletions.ts` | Execution. Moves files, writes `actions` and `fotos.status`. |
| `lib/db.ts` | `openDb()`, `insertNote()`, `deleteMissingNotes()`, `hasMissingNote()`, `fileExists()`. |
| `lib/params.ts` | `paramsPathFromArgs()`, `sourceMismatch()`, `dbFile()`. |
| `recon/recon.log` | Append-only log, written by all three. |
| `recon/history/` | Superseded design notes. Archival only. |

## Commands

Run from the project root — the scripts write `recon/recon.log` relative to it.

```bash
PARAMS=params_db.json    # which settings file this batch uses
DB=../photos/photos3.db  # dataDir + dbName from $PARAMS
```

**Always in this order.** Staging refuses to run while anything is pending, so
step 3 clears the queue before step 4 fills it again.

```bash
# 1. Sync the missing-file flags (dry run, then apply)
deno run --allow-read --allow-write recon/findMissing.ts --params=$PARAMS
deno run --allow-read --allow-write recon/findMissing.ts --params=$PARAMS --execute

# 2. See what is pending
sqlite3 -init /dev/null -batch $DB \
  "SELECT action, status, COUNT(*) FROM actions GROUP BY action, status;"

# 3. Execute pending deletes — dry run, one image, then the rest
deno run --allow-read --allow-write recon/executeDeletions.ts --params=$PARAMS
deno run --allow-read --allow-write recon/executeDeletions.ts --params=$PARAMS --execute --limit 1
deno run --allow-read --allow-write recon/executeDeletions.ts --params=$PARAMS --execute

# 4. Stage new deletes from notes
sqlite3 -init /dev/null -batch $DB < recon/notesToActions.sql

# 5. Verify
sqlite3 -init /dev/null -batch $DB "
  SELECT (SELECT COUNT(*) FROM actions WHERE action='delete' AND status='pending') AS still_pending,
         (SELECT COUNT(*) FROM actions WHERE action='delete' AND status='failed')  AS failed,
         (SELECT COUNT(*) FROM fotos   WHERE status='deleted')                     AS deleted;"
```

After step 1 you go back to the slideshow and mark more images; the loop is
review → stage → execute → review.

Both scripts take `--verbose` for a line per image, and `--limit N` to stop
after N. `-init /dev/null -batch` makes `sqlite3` ignore your personal
`~/.sqliterc` so what lands in `recon/recon.log` looks the same on any machine;
both flags apply to that one command only.

The synopsis for either script:

```
deno run --allow-read --allow-write recon/<script>.ts --params=<file> [--execute] [--limit <n>] [--verbose]
```

## Undoing a deletion

Possible by hand until you empty the trash:

```bash
mv "../photos/trash/<stem>_<img_id><ext>" "<fotos.path>/<name>"
```

```sql
UPDATE fotos   SET status = 'ok' WHERE img_id = <img_id>;
UPDATE actions SET status = 'failed', status_dt = datetime('now'),
       info = COALESCE(info || ' | ', '') || 'undone'
 WHERE img_id = <img_id> AND action = 'delete' AND status = 'done';
```

Older runs used a plain `<name>` or `<img_id>_<name>` in trash; both are still
recognised on read, so look for all three spellings.

## `img_id` is the fragile part

`notes` and `actions` identify images by `img_id` and nothing else. If
`../photos` rebuilds the catalog and the ids change, every row in both tables
silently points at the wrong image — or at nothing — and the whole deletion
history stops meaning anything.

So a rebuild is not a routine operation. Either the ids survive it, or the
rows have to be re-matched on `path` + `name` (+ `md5`) and the affected
actions set back to `pending` and re-executed. `recon/history/migrate.sql` is
the worked example, from the photos2.db → photos3.db rebuild that re-matched
841 rows.

This is worth settling before the next rebuild, not during it.

## Open questions

- **Review interface.** Reviewing `missing` notes is still a hand query against
  `v_notes`. A script that lists and prompts per row, or a web review screen,
  has been sketched but not built.
- **Confirmation strength.** Is one decision enough, or should a file have to
  stay missing across a re-check before it can be marked `delete`?
- **Circuit breaker.** How many consecutive missing images should stop the
  slideshow with an alert, instead of quietly skipping each one?
- **No test framework.** The recon scripts have been exercised against a
  throwaway fixture database, but nothing is automated.

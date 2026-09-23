# collect/

Builds and populates the photo catalog — the only module that creates or
updates `fotos` rows outright (as opposed to `curate`'s narrow `status`/
`path`/`name` exception). zsh + Python + plain SQL; shares nothing with the
Deno/TS `lib/`/`dbase/` code the other modules use — see the root
`README.md`'s note on that.

Moved here from the old `photos` project (now `photos_old`), unchanged
except for the move itself. Not yet run against this project's copy of
anything — see "Status" below.

## Pipeline

1. **`findAllImages.zsh <directory>`** — walks a directory with ExifTool,
   content-sniffing file type (catches media with a wrong/missing
   extension) rather than trusting filenames. Emits CSV: path, name, size,
   dates, camera/lens, GPS, dimensions, duration.
2. **`add_MD5.py`** (reads the CSV from stdin) — reshapes columns to match
   `fotos` (`path`/`filename` split out, `FileModifyDate` dropped after
   being used as a `dt_created` fallback) and computes each file's MD5.
   Output is the CSV `insert_files.sql` expects, 12 columns, positional.
3. **`insert_files.sql`** — loads that CSV into a `staging` table, then
   `INSERT`s into `fotos` with `status='ok'`. Run via
   `sqlite3 <db> < insert_files.sql` from the directory holding
   `photos3.csv` (the filename is hardcoded in the script).

Typical run: `findAllImages.zsh <dir> | add_MD5.py > photos3.csv`, then the
SQL step.

## Supporting scripts

- **`copy_source.zsh <source_dir> <dest_dir>`** — copies recognized
  image/video files from a source into the catalog's image folder via
  `rsync`, preserving relative structure. Source/dest are arguments, not
  hardcoded.
- **`check_completeness.sh <source_dir> <dest_dir>`** — verifies every file
  `copy_source.zsh` should have copied actually landed at the destination.
  Exists because `rsync` silently skips unreadable files, which
  `--prune-empty-dirs` can then turn into a silently-vanished folder.
- **`queries/dups.sql`** — ad-hoc queries listing images that share an MD5
  (duplicate content), for hand review.

All three shell scripts log ExifTool warnings to `logs/exiftool_warnings.log`
next to the script itself, regardless of the caller's working directory.

## Status

Copied as-is from `photos_old`; none of these have been re-run from this
location yet, and there's no params file — nothing here reads one today
(per the root README). `create_tables.sql` (in `dbase/`) hasn't been run to
create a fresh schema either — the only database in use so far is
`photos_old/photos3.db`, read in place.

## Archived

`populateDeleted.sql`, an older one-off population script, was **not**
copied here — it moved to `dbase/history/` as archival reference alongside
`migrate.sql`, since it's schema/data history rather than an active part of
this pipeline.

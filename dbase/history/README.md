# dbase/history/

One-off programs and scripts run outside the normal operations of the
project (database rebuilds, schema changes, bulk file moves). They are kept
for reference, not for re-running. File names start with a number: `1_` is
the earliest operation, and the rest follow in the order they happened.

| File | What it did |
|---|---|
| `1_migrate.sql` | Rebuilt `actions` after the photos3 db rebuild, re-matching the 841 rows by path, name and md5. |
| `2_populateDeleted.sql` | Marked photos3.db rows as deleted by matching against photos2.db's deleted rows. |
| `3_add_gone_status.sql` | Widened `actions.status` to allow `'gone'` and backfilled 13 rows. |
| `4_mv_dropbox.code` | Notes and code for moving images from the Dropbox folders to the photos folder. |
| `5_nextMove` | Plan for the remaining file moves, block by block, using `6_db_after_cp.zsh`. |
| `6_db_after_cp.zsh` | Updates the db (`actions`, `fotos.path`) after files were copied to a new folder. |

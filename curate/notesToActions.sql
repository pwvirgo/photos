-- notesToActions.sql
--
-- Stage pending 'delete' actions from notes with category 'delete'.
--   The notes table is not modified - maintence is done by the user

-- Run from curate/, e.g.:
--   DB=/Users/mac24/a/projects/photos_old/photos3.db
--   sqlite3 -init /dev/null -batch $DB < notesToActions.sql

-- - One action per img_id, however many delete notes it has.
-- - Skips images that already have a delete action (any status).
-- - action.info = is set to the note's comment OR 
--      the comments from multiple notes if an image has several 
--      delete notes; OR NULL if none of them carried a comment).

-- - Results are shown on screen and appended to curate.log (relative to
--   the where you run it -> run it in the curate folder). Errors go to
--   the screen only, unless you add `2>> curate.log` to the command line.

.bail on

-- * -init /dev/null* -batch skips ~/.sqliterc the script uses list mode

.headers on
.mode list

.output |tee -a curate.log
.print ''
.print '=== notesToActions.sql ==='
SELECT datetime('now','localtime') AS run_at;
-- Which database this run touched: the log is otherwise silent about it, and
-- the db comes from the command line, not from any params file.
SELECT file AS db FROM pragma_database_list WHERE name = 'main';

BEGIN;

CREATE TEMP TABLE staged AS
SELECT s.img_id,
       s.comments,
       f.path || '/' || f.name AS full_path,
       CASE
         WHEN f.img_id IS NULL THEN 'no fotos row'
         WHEN EXISTS (SELECT 1 FROM actions a 
            WHERE a.img_id = s.img_id AND 
            a.action = 'delete' AND a.status='pending')
           THEN 'already has a delete action'
       END AS skip_reason
FROM (
  SELECT img_id,
         GROUP_CONCAT(NULLIF(TRIM(comment), ''), ' | ') AS comments
  FROM notes
  WHERE LOWER(TRIM(category)) = 'delete'
  GROUP BY img_id
) s
LEFT JOIN fotos f ON f.img_id = s.img_id;

SELECT 'SKIPPED' AS result, img_id, skip_reason, full_path
FROM staged WHERE skip_reason IS NOT NULL;

INSERT INTO actions (action, info, request_dt, status_dt, status, img_id)
SELECT 'delete',
       comments,          -- the note's comment verbatim; no prefix, no note ids
       datetime('now'),
       datetime('now'),
       'pending',
       img_id
FROM staged
WHERE skip_reason IS NULL;

SELECT 'STAGED' AS result, changes() AS actions_inserted;

COMMIT;

.output stdout

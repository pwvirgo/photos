-- recon/notesToActions.sql
--
-- Stage pending 'delete' actions from notes with category 'delete'.
-- Run AFTER recon/executeDeletions.ts has cleared the existing pending actions:
--   sqlite3 -init /dev/null -batch ../photos/photos3.db < recon/notesToActions.sql
--
-- -init /dev/null -batch skips ~/.sqliterc, so what lands in recon/recon.log
-- does not depend on whose machine ran it. Both flags are per-invocation.
--
-- - One action per img_id, however many delete notes it has.
-- - Skips images that already have a delete action (any status).
-- - info = the note's comment, nothing else (' | '-joined if an image has
--   several delete notes; NULL if none of them carried a comment).
-- - 'missing' notes are ignored; notes rows are left as they are.
-- - Results are shown on screen and appended to recon/recon.log (relative to
--   the project root, so run from there). Errors go to the screen only, unless
--   you add `2>> recon/recon.log` to the command line.

.bail on

-- Set the output format here rather than inheriting it: the run is invoked
-- with -init /dev/null, so nothing else defines it, and recon/recon.log should
-- be self-describing. list mode (not column) keeps long paths untruncated.
.headers on
.mode list

.output |tee -a recon/recon.log
.print ''
.print '=== recon/notesToActions.sql ==='
SELECT datetime('now','localtime') AS run_at;
-- Which database this run touched: the log is otherwise silent about it, and
-- the db comes from the command line, not from any params file.
SELECT file AS db FROM pragma_database_list WHERE name = 'main';

BEGIN;

-- Refuse to run while pending actions remain (CHECK fails -> .bail rolls back).
CREATE TEMP TABLE guard (pending INTEGER CHECK (pending = 0));
INSERT INTO guard SELECT COUNT(*) FROM actions WHERE status = 'pending';

CREATE TEMP TABLE staged AS
SELECT s.img_id,
       s.comments,
       f.path || '/' || f.name AS full_path,
       CASE
         WHEN f.img_id IS NULL THEN 'no fotos row'
         WHEN EXISTS (SELECT 1 FROM actions a WHERE a.img_id = s.img_id AND a.action = 'delete')
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

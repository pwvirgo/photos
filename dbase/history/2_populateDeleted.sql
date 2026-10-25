-- Mark photos3.db rows as deleted when the same photo appears in
-- backup/photos2.db:deleted.
--
-- Match rule:
--   - same filename
--   - same path after replacing the old images/ root with images3/
--   - same md5
--
-- Review helpers are included before and after the UPDATE.

.headers on
.mode column

ATTACH 'backup/photos2.db' AS old;

-- Expected current match counts before the update.
SELECT 'photos2.deleted rows' AS check_name, count(*) AS row_count
FROM old.deleted;

SELECT 'photos3 rows matching deleted by path/name/md5' AS check_name,
       count(*) AS row_count
FROM fotos AS f
JOIN old.deleted AS d
  ON replace(d.path,
             '/Users/mac24/a/projects/photos/images/',
             '/Users/mac24/a/projects/photos/images3/') = f.path
 AND d.name = f.name
 AND coalesce(d.md5, '') = coalesce(f.md5, '');

BEGIN TRANSACTION;

UPDATE fotos
SET status = 'deleted'
WHERE EXISTS (
    SELECT 1
    FROM old.deleted AS d
    WHERE replace(d.path,
                  '/Users/mac24/a/projects/photos/images/',
                  '/Users/mac24/a/projects/photos/images3/') = fotos.path
      AND d.name = fotos.name
      AND coalesce(d.md5, '') = coalesce(fotos.md5, '')
);

COMMIT;

-- Review counts after the update.
SELECT 'photos3 rows now marked deleted' AS check_name, count(*) AS row_count
FROM fotos
WHERE status = 'deleted';

DETACH old;

-- In Sept 2026 I rebuilt the photos3 database from disk because the
-- original db was incomplete.  I had already selected 850 images to
-- be deleted but the img_id (aka fotos.id) were of no use as they 
-- were all regenerated.

-- This script recreated the actions table using the path, name, 
-- and md5 to match the old actions to the new fotos table.

ATTACH '../photos/photos3.db' AS photos3;

INSERT INTO photos3.actions (action, info, request_dt, status_dt, status, img_id)
SELECT a.action,
       'round1:' || a.action_id,
       a.request_dt,
       a.request_dt,
       'pending',
       f.img_id
FROM actions a
JOIN deleted d ON d.img_id = a.img_id
JOIN photos3.fotos f
  ON f.path = REPLACE(d.path, '/images/', '/images3/')
 AND f.name = d.name
 AND f.md5  = d.md5

UNION ALL

SELECT a.action,
       'round1:' || a.action_id,
       a.request_dt,
       a.request_dt,
       'pending',
       f.img_id
FROM actions a
JOIN fotos old_f ON old_f.img_id = a.img_id
JOIN photos3.fotos f
  ON f.path = REPLACE(old_f.path, '/images/', '/images3/')
 AND f.name = old_f.name
 AND f.md5  = old_f.md5
WHERE a.img_id NOT IN (SELECT img_id FROM deleted);

DETACH photos3;

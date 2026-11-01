-- Give every photo in one folder a copy of one photo's prov row, with a
-- sequence number appended to the title: "Title 01", "Title 02", ...
--
-- Source: img_id 5710 (its prov row, and its fotos.path = the folder).
-- NOT RUN YET.
--
-- Compared with prov_populate.sql (the Picnic time-lapse):
-- that one pulled the number out of the file name (substr(name, 6, 3) - 186),
-- which only works for names like IM000188. This one numbers the photos with
-- row_number(), a window function: sort the folder's photos and count them
-- 1, 2, 3... So any file names work, and nothing has to be worked out by hand.
--
-- Steps, in the sqlite3 shell:
--   1. Run the PREVIEW query and check the list.
--   2. Run BEGIN; then the INSERT; then the CHECK query.
--   3. COMMIT; if it looks right, ROLLBACK; if not.


-- ---------------------------------------------------------------------------
-- PREVIEW (read-only): what each photo would get, and whether it already
-- has a prov row.
-- ---------------------------------------------------------------------------
WITH src AS (
  SELECT p.*, f.path
  FROM prov p JOIN fotos f ON f.img_id = p.img_id
  WHERE p.img_id = 5710
),
seq AS (
  SELECT f.img_id, f.name,
         -- the counter: 1, 2, 3... in file-name order
         row_number() OVER (ORDER BY f.name) AS n,
         -- how many photos in all, to pick the zero-pad width
         count(*)     OVER ()                AS total
  FROM fotos f, src
  WHERE f.path = src.path AND f.status = 'ok'
)
SELECT seq.n, seq.img_id, seq.name,
       src.title || ' ' || printf('%0*d', max(2, length(seq.total)), seq.n) AS new_title,
       CASE WHEN seq.img_id = 5710                                     THEN 'source: title only'
            WHEN EXISTS (SELECT 1 FROM prov WHERE img_id = seq.img_id) THEN 'HAS PROV: left alone'
            ELSE 'new row' END AS what_happens
FROM seq, src
ORDER BY seq.n;


-- ---------------------------------------------------------------------------
-- INSERT
-- ---------------------------------------------------------------------------
WITH src AS (
  SELECT p.*, f.path
  FROM prov p JOIN fotos f ON f.img_id = p.img_id
  WHERE p.img_id = 5710
),
seq AS (
  SELECT f.img_id,
         row_number() OVER (ORDER BY f.name) AS n,
         count(*)     OVER ()                AS total
  FROM fotos f, src
  WHERE f.path = src.path AND f.status = 'ok'
)
INSERT INTO prov (img_id, title, subtitle, place, event_time, subjects,
                  source, shooter, photo_rank, event_rank, comment)
SELECT seq.img_id,
       src.title || ' ' || printf('%0*d', max(2, length(seq.total)), seq.n),
       src.subtitle, src.place, src.event_time, src.subjects,
       src.source, src.shooter, src.photo_rank, src.event_rank, src.comment
FROM seq, src
WHERE true          -- SQLite needs a WHERE here so it can parse the ON CONFLICT
ON CONFLICT (img_id) DO UPDATE
  SET title = excluded.title
  WHERE prov.img_id = 5710;


-- ---------------------------------------------------------------------------
-- CHECK (read-only)
-- ---------------------------------------------------------------------------
SELECT f.name, p.img_id, p.title
FROM fotos f JOIN prov p ON p.img_id = f.img_id
WHERE f.path = (SELECT path FROM fotos WHERE img_id = 5710)
ORDER BY f.name;


-- ---------------------------------------------------------------------------
-- How it works
-- ---------------------------------------------------------------------------
-- WITH src AS (...), seq AS (...)
--   Named sub-queries (CTEs), used like temporary tables in the statement
--   that follows them. src = the source prov row plus its folder.
--   seq = every live photo in that folder, numbered.
--
-- row_number() OVER (ORDER BY f.name)
--   Numbers the rows 1, 2, 3... in file-name order. To number by when they
--   were shot instead, use ORDER BY f.dt_taken, f.name.
--
-- count(*) OVER ()
--   The total number of photos, given on every row (no GROUP BY needed).
--
-- printf('%0*d', max(2, length(seq.total)), seq.n)
--   Zero-pads the number. The * takes the width from the next argument:
--   2 digits normally (01..99), 3 if the folder has 100+ photos.
--
-- src.title || ' ' || ...
--   || joins strings: "Picnic" -> "Picnic 01". If the source title is NULL,
--   the result is NULL — give 5710 a title first.
--
-- ON CONFLICT (img_id) DO UPDATE SET title = excluded.title
--                      WHERE prov.img_id = 5710
--   An "upsert". img_id is prov's primary key, so a photo that already has a
--   prov row is a conflict. For 5710 only, the conflict updates the title
--   (excluded.title = the title this INSERT tried to write), so the source
--   becomes "Title NN" too. Any other photo that already has a prov row is
--   left exactly as it is: its hand-entered data is not overwritten. Its
--   number is simply not used, so the sequence will have a gap there. The
--   PREVIEW marks those rows "HAS PROV".
--
-- Reading and writing prov in one statement is safe: when the INSERT's source
-- includes the same table, SQLite collects the whole SELECT result before it
-- writes anything.
--
-- Values are copied exactly as stored. There's no trimming or blank-to-NULL,
-- unlike saveProv() in dbase/db.ts.

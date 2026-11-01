-- Copy one prov row to the rest of a numbered series of photos, numbering
-- the title as it goes. Written for the EatingArtichoke time-lapse: the prov
-- row on IM000187 (img_id 2658, "Picnic 01") copied to IM000188..IM000201 as
-- "Picnic 02".."Picnic 15". (That was actually done by prov_populate.ts, the
-- Deno version; this is the plain-SQL equivalent, kept as a pattern.)
--
-- To reuse: change 2658 (the source img_id, twice), the name range, the
-- substr() position/length of the number, the 186 offset (= first number - 1),
-- and the title text in printf().
--
-- Preview first: run only the SELECT part (from SELECT to the ;) to see the
-- rows that would be inserted, then add the INSERT line back.
--
-- Notes:
--   * Matches photos by NAME, not img_id — img_ids are not in name order.
--   * The camera reused file names (another IM000187 is in 2001MyAprtment),
--     so photos are limited to the source photo's folder (f.path = ...).
--   * Name range uses >= / < rather than BETWEEN so the extension (.JPG)
--     doesn't matter.
--   * Fails with "UNIQUE constraint failed: prov.img_id" if any target already
--     has a prov row (img_id is prov's primary key) — nothing is inserted.
--   * Unlike saveProv() in dbase/db.ts, no trimming or blank-to-NULL: values
--     are copied exactly as stored in the source row.

INSERT INTO prov (img_id, title, subtitle, place, event_time, subjects,
                  source, shooter, photo_rank, event_rank, comment)
SELECT f.img_id,
       -- 'IM000188.JPG': chars 6-8 are '188'; minus 186 gives 2 -> 'Picnic 02'
       printf('Picnic %02d', substr(f.name, 6, 3) - 186),
       p.subtitle, p.place, p.event_time, p.subjects,
       p.source, p.shooter, p.photo_rank, p.event_rank, p.comment
-- every target photo paired with the one source prov row
FROM fotos f, prov p
WHERE p.img_id = 2658
  AND f.path = (SELECT path FROM fotos WHERE img_id = 2658)
  AND f.status = 'ok'
  AND f.name >= 'IM000188' AND f.name < 'IM000202';

-- import data from photos3.csv into the current SQLite database

DROP TABLE IF EXISTS staging;

-- Create staging with 12 columns - matchng Python output count
CREATE TABLE staging (
    c1 TEXT, c2 TEXT, c3 TEXT, c4 TEXT, c5 TEXT, c6 TEXT,
    c7 TEXT, c8 TEXT, c9 TEXT, c10 TEXT, c11 TEXT, c12 TEXT
);

.mode csv
-- Import. Since the table exists, SQLite will skip the CSV header
-- newer versions of SQLite can skip the header while creating the table
.import --skip 1 photos3.csv staging

INSERT INTO fotos (
    path, name, status, bytes, dt_taken, dt_created, camera, lens, lat, lon,
    img_size, duration, MD5
)
SELECT c1, c2, 'ok', c3, c4, c5, c6, c7, c8, c9, c10, c11, c12 FROM staging;

-- Cleanup
DROP TABLE staging;

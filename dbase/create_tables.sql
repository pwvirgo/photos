/* document status of images as they are edited */

CREATE TABLE fotos (
    img_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT,
    name        TEXT,
    status      TEXT CHECK(status IN ('ok','deleted')) DEFAULT 'ok',
    bytes       INTEGER,
    dt_taken    TEXT,
    dt_created  TEXT,
    camera      TEXT,
    lens        TEXT,
    lat         REAL,
    lon         REAL,
    img_size    TEXT,
    duration    TEXT,
    md5         TEXT
);

CREATE TABLE notes (
    note_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT,
    rank        INTEGER CHECK(rank IN (1,2,3,4,5)),
    comment     TEXT,
    img_id      INTEGER,
    note_dt     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (img_id) REFERENCES fotos(img_id)
);

-- action/status use CHECK for now as a fixed vocabulary; may become lookup
-- tables later if the set of values needs to grow without editing this schema.
CREATE TABLE actions (
    action_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT CHECK(action IN ('mv','delete','rotate','resize','crop','edit','other')),
    info        TEXT,
    request_dt  TEXT DEFAULT (datetime('now')),
    status_dt   TEXT,
    status      TEXT CHECK(status IN ('done','pending','failed')) DEFAULT 'pending',
    img_id      INTEGER,
    FOREIGN KEY (img_id) REFERENCES fotos(img_id)
);

CREATE INDEX idx_notes_img_id   ON notes(img_id);
CREATE INDEX idx_actions_img_id ON actions(img_id);

CREATE VIEW vnote AS
SELECT n.category, n.comment, f.path, f.name, f.status,
    n.note_dt, f.bytes / 1048576.0 AS megabytes, f.img_id 
FROM notes n
LEFT JOIN fotos f ON f.img_id = n.img_id;

CREATE VIEW vaction AS
SELECT a.action, a.status as a_status, 
    substr(a.status_dt,1,10) as a_status_dt,
    f.status as f_status, f.path, f.name,
    f.img_id 
FROM actions a
LEFT JOIN fotos f ON f.img_id = a.img_id;

SELECT n.category, substr(n.comment,1,10) AS comment,
       a.action,
       a.status  AS action_status,
       f.status  AS foto_status,
       substr(f.path,32, 20) as spath, f.name, f.img_id
FROM notes AS n
LEFT JOIN actions AS a ON a.img_id = n.img_id
LEFT JOIN fotos   AS f ON f.img_id = n.img_id
WHERE n.category = 'missing'
ORDER BY spath, name;

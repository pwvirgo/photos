-- dbase/history/add_gone_status.sql
--
-- One-time migration: widen actions.status to allow 'gone', and backfill the
-- 13 existing rows that recorded a file deleted outside the pipeline (by
-- hand, info='deleted with macOS') the only way the old schema allowed —
-- status='failed', which should mean "the pipeline tried and something
-- broke," not "the requested outcome already happened by other means."
--
-- SQLite can't ALTER a CHECK constraint in place; this is the standard
-- recreate-and-swap procedure (same shape as history/migrate.sql, but no
-- img_id/action_id renumbering — every row is copied through unchanged).
--
-- Run once against the live db:
--   sqlite3 -init /dev/null -batch $DB < dbase/history/add_gone_status.sql

BEGIN;

CREATE TABLE actions_new (
    action_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT CHECK(action IN ('mv','delete','rotate','resize','crop','edit','other')),
    info        TEXT,
    request_dt  TEXT DEFAULT (datetime('now')),
    status_dt   TEXT,
    status      TEXT CHECK(status IN ('done','pending','failed','gone')) DEFAULT 'pending',
    img_id      INTEGER,
    FOREIGN KEY (img_id) REFERENCES fotos(img_id)
);

INSERT INTO actions_new SELECT * FROM actions;
DROP TABLE actions;
ALTER TABLE actions_new RENAME TO actions;

CREATE INDEX idx_actions_img_id ON actions(img_id);

UPDATE actions SET status = 'gone'
WHERE action = 'delete' AND status = 'failed' AND info = 'deleted with macOS';

COMMIT;

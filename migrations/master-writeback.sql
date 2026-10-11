-- Additive only: no existing tables or records are modified.
CREATE TABLE IF NOT EXISTS master_writeback_lock (
  id INTEGER PRIMARY KEY CHECK (id=1), owner TEXT, expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO master_writeback_lock(id) VALUES(1);
CREATE TABLE IF NOT EXISTS master_writeback_jobs (
  id TEXT PRIMARY KEY, sequence TEXT NOT NULL, previous_data TEXT,
  desired_data TEXT NOT NULL, status TEXT NOT NULL,
  result TEXT, last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

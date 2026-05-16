CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content       TEXT NOT NULL,
  category      TEXT NOT NULL,
  importance    INTEGER NOT NULL DEFAULT 5,
  tags          TEXT,
  source        TEXT,
  embedding     BLOB NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  superseded_by INTEGER,
  FOREIGN KEY (superseded_by) REFERENCES entries(id)
);
CREATE INDEX idx_entries_category ON entries(category);
CREATE INDEX idx_entries_superseded ON entries(superseded_by);
CREATE INDEX idx_entries_created ON entries(created_at);

CREATE TABLE edges (
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id, relation),
  FOREIGN KEY (from_id) REFERENCES entries(id),
  FOREIGN KEY (to_id) REFERENCES entries(id)
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta VALUES ('schema_version', '1'),
                       ('embedding_model', 'nomic-embed-text'),
                       ('embedding_dims', '768');

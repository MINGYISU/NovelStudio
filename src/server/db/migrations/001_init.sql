-- 001_init: books, nodes, snapshots, assets (ARCHITECTURE §5)

CREATE TABLE books (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  cover_asset_id TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE nodes (
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES nodes(id),
  kind          TEXT NOT NULL CHECK (kind IN ('volume','part','chapter','scene')),
  title         TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL,
  numbered      INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft',
  synopsis      TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
  plain_text    TEXT NOT NULL DEFAULT '',
  word_count    INTEGER NOT NULL DEFAULT 0,
  rev           INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX nodes_tree ON nodes(book_id, parent_id, position);

CREATE TABLE snapshots (
  id          TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  word_count  INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

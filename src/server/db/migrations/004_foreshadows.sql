-- 004_foreshadows: foreshadowing threads and their occurrences (ARCHITECTURE §5, §11, M7)

CREATE TABLE foreshadows (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planned',
  color       TEXT NOT NULL DEFAULT '#c0841a',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX foreshadows_book ON foreshadows(book_id, created_at);

CREATE TABLE foreshadow_occurrences (
  id            TEXT PRIMARY KEY,
  foreshadow_id TEXT NOT NULL REFERENCES foreshadows(id) ON DELETE CASCADE,
  node_id       TEXT REFERENCES nodes(id),
  role          TEXT NOT NULL CHECK (role IN ('setup','hint','payoff')),
  excerpt       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  anchored      INTEGER NOT NULL DEFAULT 0,
  anchor_state  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX foreshadow_occurrences_thread ON foreshadow_occurrences(foreshadow_id, created_at);
CREATE INDEX foreshadow_occurrences_node ON foreshadow_occurrences(node_id);

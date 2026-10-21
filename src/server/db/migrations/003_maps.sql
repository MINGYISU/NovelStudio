-- 003_maps: story maps (ARCHITECTURE §5, §9, M6)

CREATE TABLE maps (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  template    TEXT NOT NULL,
  data        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX maps_book ON maps(book_id, position);

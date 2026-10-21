-- 002_codex: codex categories and entries (ARCHITECTURE §5, M5)

CREATE TABLE codex_categories (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  field_template TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX codex_categories_book ON codex_categories(book_id, position);

CREATE TABLE codex_entries (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES codex_categories(id),
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  fields         TEXT NOT NULL DEFAULT '[]',
  image_asset_id TEXT REFERENCES assets(id),
  position       INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX codex_entries_category ON codex_entries(category_id, position);
CREATE INDEX codex_entries_book ON codex_entries(book_id);

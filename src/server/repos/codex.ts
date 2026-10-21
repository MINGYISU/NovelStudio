import {
  codexFieldDefSchema,
  codexFieldSchema,
  type CodexCategory,
  type CodexEntry,
  type CodexField,
  type CodexFieldDef,
} from '../../shared/schemas/codex.ts';
import type { Db } from '../db/connection.ts';

interface RawCategory {
  id: string;
  book_id: string;
  name: string;
  position: number;
  field_template: string;
}

interface RawEntry {
  id: string;
  book_id: string;
  category_id: string;
  title: string;
  summary: string;
  fields: string;
  image_asset_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Reads a JSON array column item by item, so one damaged item never hides the rest. */
function parseItems<T>(json: string, parse: (item: unknown) => T | null): T[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const item of raw) {
    const parsed = parse(item);
    const key = (parsed as { key?: string } | null)?.key;
    if (parsed === null || key === undefined || seen.has(key)) continue;
    seen.add(key);
    items.push(parsed);
  }
  return items;
}

const parseDef = (item: unknown): CodexFieldDef | null => {
  const r = codexFieldDefSchema.safeParse(item);
  return r.success ? r.data : null;
};
const parseField = (item: unknown): CodexField | null => {
  const r = codexFieldSchema.safeParse(item);
  return r.success ? r.data : null;
};

function toCategory(row: RawCategory): CodexCategory {
  return {
    id: row.id,
    bookId: row.book_id,
    name: row.name,
    position: row.position,
    fieldTemplate: parseItems(row.field_template, parseDef),
  };
}

function toEntry(row: RawEntry): CodexEntry {
  return {
    id: row.id,
    bookId: row.book_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    fields: parseItems(row.fields, parseField),
    imageAssetId: row.image_asset_id,
    imageUrl: row.image_asset_id ? `/assets/${row.book_id}/${row.image_asset_id}` : null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCategories(db: Db, bookId: string): CodexCategory[] {
  const rows = db
    .prepare('SELECT * FROM codex_categories WHERE book_id = ? ORDER BY position, id')
    .all(bookId) as RawCategory[];
  return rows.map(toCategory);
}

export function getCategory(db: Db, id: string): CodexCategory | null {
  const row = db.prepare('SELECT * FROM codex_categories WHERE id = ?').get(id) as
    RawCategory | undefined;
  return row ? toCategory(row) : null;
}

export function insertCategory(db: Db, category: CodexCategory): void {
  db.prepare(
    `INSERT INTO codex_categories (id, book_id, name, position, field_template)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    category.id,
    category.bookId,
    category.name,
    category.position,
    JSON.stringify(category.fieldTemplate),
  );
}

export function updateCategoryRow(
  db: Db,
  id: string,
  patch: { name?: string; fieldTemplate?: CodexFieldDef[] },
): void {
  if (patch.name !== undefined) {
    db.prepare('UPDATE codex_categories SET name = ? WHERE id = ?').run(patch.name, id);
  }
  if (patch.fieldTemplate !== undefined) {
    db.prepare('UPDATE codex_categories SET field_template = ? WHERE id = ?').run(
      JSON.stringify(patch.fieldTemplate),
      id,
    );
  }
}

export function deleteCategoryRow(db: Db, id: string): void {
  db.prepare('DELETE FROM codex_categories WHERE id = ?').run(id);
}

export function setCategoryPositions(db: Db, orderedIds: readonly string[]): void {
  const stmt = db.prepare('UPDATE codex_categories SET position = ? WHERE id = ?');
  orderedIds.forEach((id, index) => stmt.run(index, id));
}

export function countEntriesInCategory(db: Db, categoryId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM codex_entries WHERE category_id = ?')
    .get(categoryId) as { n: number };
  return row.n;
}

export function listEntries(db: Db, bookId: string): CodexEntry[] {
  const rows = db
    .prepare('SELECT * FROM codex_entries WHERE book_id = ? ORDER BY category_id, position, id')
    .all(bookId) as RawEntry[];
  return rows.map(toEntry);
}

export function listCategoryEntries(db: Db, categoryId: string): CodexEntry[] {
  const rows = db
    .prepare('SELECT * FROM codex_entries WHERE category_id = ? ORDER BY position, id')
    .all(categoryId) as RawEntry[];
  return rows.map(toEntry);
}

export function getEntry(db: Db, id: string): CodexEntry | null {
  const row = db.prepare('SELECT * FROM codex_entries WHERE id = ?').get(id) as
    RawEntry | undefined;
  return row ? toEntry(row) : null;
}

export function insertEntry(db: Db, entry: Omit<CodexEntry, 'imageUrl'>): void {
  db.prepare(
    `INSERT INTO codex_entries (id, book_id, category_id, title, summary, fields, image_asset_id,
                                position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.bookId,
    entry.categoryId,
    entry.title,
    entry.summary,
    JSON.stringify(entry.fields),
    entry.imageAssetId,
    entry.position,
    entry.createdAt,
    entry.updatedAt,
  );
}

export interface EntryUpdate {
  title?: string;
  summary?: string;
  fields?: CodexField[];
  imageAssetId?: string | null;
}

export function updateEntryRow(db: Db, id: string, update: EntryUpdate, now: string): void {
  const columns: string[] = [];
  const values: (string | null)[] = [];
  if (update.title !== undefined) {
    columns.push('title = ?');
    values.push(update.title);
  }
  if (update.summary !== undefined) {
    columns.push('summary = ?');
    values.push(update.summary);
  }
  if (update.fields !== undefined) {
    columns.push('fields = ?');
    values.push(JSON.stringify(update.fields));
  }
  if (update.imageAssetId !== undefined) {
    columns.push('image_asset_id = ?');
    values.push(update.imageAssetId);
  }
  columns.push('updated_at = ?');
  values.push(now);
  db.prepare(`UPDATE codex_entries SET ${columns.join(', ')} WHERE id = ?`).run(...values, id);
}

export function deleteEntryRow(db: Db, id: string): void {
  db.prepare('DELETE FROM codex_entries WHERE id = ?').run(id);
}

export function setEntryPositions(db: Db, orderedIds: readonly string[]): void {
  const stmt = db.prepare('UPDATE codex_entries SET position = ? WHERE id = ?');
  orderedIds.forEach((id, index) => stmt.run(index, id));
}

/** True when an entry or the book cover still uses the asset, so the file must stay. */
export function isAssetInUse(db: Db, assetId: string): boolean {
  return (
    db.prepare('SELECT 1 FROM codex_entries WHERE image_asset_id = ?').get(assetId) !== undefined ||
    db.prepare('SELECT 1 FROM books WHERE cover_asset_id = ?').get(assetId) !== undefined
  );
}

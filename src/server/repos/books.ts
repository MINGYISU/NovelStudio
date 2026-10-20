import crypto from 'node:crypto';
import type { Book, BookSort, CreateBookBody } from '../../shared/schemas/book.ts';
import {
  bookSettingsSchema,
  DEFAULT_STRUCTURE,
  type StructureSettings,
} from '../../shared/schemas/structure.ts';
import type { Db } from '../db/connection.ts';

interface RawBook {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_asset_id: string | null;
  settings: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Settings that fail validation fall back to the defaults instead of breaking the book. */
export function parseStructure(settingsJson: string | null) {
  try {
    const parsed = bookSettingsSchema.safeParse(JSON.parse(settingsJson ?? '{}'));
    return parsed.success ? parsed.data.structure : DEFAULT_STRUCTURE;
  } catch {
    return DEFAULT_STRUCTURE;
  }
}

function toBook(row: RawBook, wordCount: number): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    description: row.description,
    coverAssetId: row.cover_asset_id,
    coverUrl: row.cover_asset_id ? `/assets/${row.id}/${row.cover_asset_id}` : null,
    wordCount,
    structure: parseStructure(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Word counts of live sections only: a trashed section hides its whole subtree. */
function wordCounts(db: Db, bookId?: string): Map<string, number> {
  const rows = db
    .prepare(
      `WITH RECURSIVE live(id, book_id, word_count) AS (
         SELECT id, book_id, word_count FROM nodes
          WHERE parent_id IS NULL AND deleted_at IS NULL
         UNION ALL
         SELECT n.id, n.book_id, n.word_count FROM nodes n
           JOIN live l ON n.parent_id = l.id
          WHERE n.deleted_at IS NULL
       )
       SELECT book_id, SUM(word_count) AS words FROM live
        WHERE (@id IS NULL OR book_id = @id) GROUP BY book_id`,
    )
    .all({ id: bookId ?? null }) as { book_id: string; words: number }[];
  return new Map(rows.map((r) => [r.book_id, r.words]));
}

export function listBooks(db: Db, options: { trashed: boolean; sort: BookSort }): Book[] {
  const rows = db
    .prepare(
      `SELECT * FROM books WHERE deleted_at IS ${options.trashed ? 'NOT NULL' : 'NULL'}
        ORDER BY updated_at DESC, id`,
    )
    .all() as RawBook[];
  const counts = wordCounts(db);
  const books = rows.map((row) => toBook(row, counts.get(row.id) ?? 0));
  if (options.sort === 'title') {
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    books.sort((a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
  }
  return books;
}

export function getBook(db: Db, id: string): Book | null {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as RawBook | undefined;
  return row ? toBook(row, wordCounts(db, id).get(id) ?? 0) : null;
}

/** The raw `settings` JSON; the caller validates it with Zod. */
export function getBookSettingsJson(db: Db, id: string): string | null {
  const row = db.prepare('SELECT settings FROM books WHERE id = ?').get(id) as
    { settings: string } | undefined;
  return row ? row.settings : null;
}

export function insertBook(db: Db, body: CreateBookBody, now: string): Book {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO books (id, title, author, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, body.title, body.author ?? '', body.description ?? '', now, now);
  const book = getBook(db, id);
  if (!book) throw new Error('Inserted book not found');
  return book;
}

/** Replaces only `structure`; other settings keys (display, foreshadow, …) are preserved. */
function mergeStructure(settingsJson: string | null, structure: StructureSettings): string {
  let current: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(settingsJson ?? '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      current = parsed as Record<string, unknown>;
    }
  } catch {
    current = {};
  }
  return JSON.stringify({ ...current, structure });
}

export interface BookUpdate {
  title?: string;
  author?: string;
  description?: string;
  coverAssetId?: string | null;
  structure?: StructureSettings;
}

export function updateBookFields(db: Db, id: string, update: BookUpdate, now: string): void {
  const columns: string[] = [];
  const values: (string | null)[] = [];
  if (update.title !== undefined) {
    columns.push('title = ?');
    values.push(update.title);
  }
  if (update.author !== undefined) {
    columns.push('author = ?');
    values.push(update.author);
  }
  if (update.description !== undefined) {
    columns.push('description = ?');
    values.push(update.description);
  }
  if (update.coverAssetId !== undefined) {
    columns.push('cover_asset_id = ?');
    values.push(update.coverAssetId);
  }
  if (update.structure !== undefined) {
    columns.push('settings = ?');
    values.push(mergeStructure(getBookSettingsJson(db, id), update.structure));
  }
  columns.push('updated_at = ?');
  values.push(now);
  db.prepare(`UPDATE books SET ${columns.join(', ')} WHERE id = ?`).run(...values, id);
}

/** Trash and restore deliberately leave updated_at alone: it means "last edited". */
export function setBookDeletedAt(db: Db, id: string, deletedAt: string | null): void {
  db.prepare('UPDATE books SET deleted_at = ? WHERE id = ?').run(deletedAt, id);
}

/** Child rows (nodes, snapshots, assets) go with the book through ON DELETE CASCADE. */
export function deleteBook(db: Db, id: string): void {
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

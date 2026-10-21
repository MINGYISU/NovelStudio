import type { Db } from '../db/connection.ts';
import type { AssetMime, AssetRow } from './assets.ts';

export interface BookExportRow {
  id: string;
  title: string;
  author: string;
  description: string;
  coverAssetId: string | null;
  settings: string;
  createdAt: string;
  updatedAt: string;
}

export interface FullNodeRow {
  id: string;
  bookId: string;
  parentId: string | null;
  kind: 'volume' | 'part' | 'chapter' | 'scene';
  title: string;
  position: number;
  numbered: boolean;
  status: 'idea' | 'draft' | 'revising' | 'done';
  synopsis: string;
  content: string;
  plainText: string;
  wordCount: number;
  rev: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function getBookExportRow(db: Db, id: string): BookExportRow | null {
  const row = db
    .prepare(
      `SELECT id, title, author, description, cover_asset_id, settings, created_at, updated_at
         FROM books WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        title: string;
        author: string;
        description: string;
        cover_asset_id: string | null;
        settings: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  return row
    ? {
        id: row.id,
        title: row.title,
        author: row.author,
        description: row.description,
        coverAssetId: row.cover_asset_id,
        settings: row.settings,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

export function listFullNodes(db: Db, bookId: string): FullNodeRow[] {
  const rows = db
    .prepare(
      `SELECT id, book_id, parent_id, kind, title, position, numbered, status, synopsis, content,
              plain_text, word_count, rev, created_at, updated_at, deleted_at
         FROM nodes WHERE book_id = ?`,
    )
    .all(bookId) as {
    id: string;
    book_id: string;
    parent_id: string | null;
    kind: FullNodeRow['kind'];
    title: string;
    position: number;
    numbered: number;
    status: FullNodeRow['status'];
    synopsis: string;
    content: string;
    plain_text: string;
    word_count: number;
    rev: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    parentId: r.parent_id,
    kind: r.kind,
    title: r.title,
    position: r.position,
    numbered: r.numbered === 1,
    status: r.status,
    synopsis: r.synopsis,
    content: r.content,
    plainText: r.plain_text,
    wordCount: r.word_count,
    rev: r.rev,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }));
}

export function listBookAssets(db: Db, bookId: string): AssetRow[] {
  const rows = db
    .prepare('SELECT * FROM assets WHERE book_id = ? ORDER BY created_at, id')
    .all(bookId) as {
    id: string;
    book_id: string;
    file_name: string;
    mime: AssetMime;
    bytes: number;
    sha256: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    fileName: r.file_name,
    mime: r.mime,
    bytes: r.bytes,
    sha256: r.sha256,
    createdAt: r.created_at,
  }));
}

export type IdTable =
  'books' | 'nodes' | 'assets' | 'snapshots' | 'codex_categories' | 'codex_entries' | 'maps';

/** Which of these ids already exist in the table (restore remaps everything if any do). */
export function anyIdExists(db: Db, table: IdTable, ids: readonly string[]): boolean {
  const stmt = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`);
  return ids.some((id) => stmt.get(id) !== undefined);
}

export function titleExists(db: Db, title: string): boolean {
  return db.prepare('SELECT 1 FROM books WHERE title = ?').get(title) !== undefined;
}

export function insertBookRow(db: Db, book: BookExportRow): void {
  db.prepare(
    `INSERT INTO books (id, title, author, description, cover_asset_id, settings, created_at,
                        updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    book.id,
    book.title,
    book.author,
    book.description,
    book.coverAssetId,
    book.settings,
    book.createdAt,
    book.updatedAt,
  );
}

export function insertFullNodeRow(db: Db, node: FullNodeRow): void {
  db.prepare(
    `INSERT INTO nodes (id, book_id, parent_id, kind, title, position, numbered, status, synopsis,
                        content, plain_text, word_count, rev, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    node.id,
    node.bookId,
    node.parentId,
    node.kind,
    node.title,
    node.position,
    node.numbered ? 1 : 0,
    node.status,
    node.synopsis,
    node.content,
    node.plainText,
    node.wordCount,
    node.rev,
    node.createdAt,
    node.updatedAt,
    node.deletedAt,
  );
}

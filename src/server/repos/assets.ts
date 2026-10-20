import type { Db } from '../db/connection.ts';

export type AssetMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface AssetRow {
  id: string;
  bookId: string;
  fileName: string;
  mime: AssetMime;
  bytes: number;
  sha256: string;
  createdAt: string;
}

interface RawAsset {
  id: string;
  book_id: string;
  file_name: string;
  mime: AssetMime;
  bytes: number;
  sha256: string;
  created_at: string;
}

function toAsset(row: RawAsset): AssetRow {
  return {
    id: row.id,
    bookId: row.book_id,
    fileName: row.file_name,
    mime: row.mime,
    bytes: row.bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export function insertAsset(db: Db, asset: AssetRow): void {
  db.prepare(
    `INSERT INTO assets (id, book_id, file_name, mime, bytes, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    asset.id,
    asset.bookId,
    asset.fileName,
    asset.mime,
    asset.bytes,
    asset.sha256,
    asset.createdAt,
  );
}

export function getAsset(db: Db, id: string): AssetRow | null {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as RawAsset | undefined;
  return row ? toAsset(row) : null;
}

export function deleteAsset(db: Db, id: string): void {
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
}

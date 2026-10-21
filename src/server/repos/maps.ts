import { readMapData, type MapData, type StoryMap } from '../../shared/schemas/map.ts';
import type { Db } from '../db/connection.ts';

interface RawMap {
  id: string;
  book_id: string;
  title: string;
  template: string;
  data: string;
  position: number;
  created_at: string;
  updated_at: string;
}

function toMap(row: RawMap): StoryMap {
  const { data, problems } = readMapData(row.data);
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    template: row.template,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
    damaged: problems.length > 0,
  };
}

export function listMaps(db: Db, bookId: string): StoryMap[] {
  const rows = db
    .prepare('SELECT * FROM maps WHERE book_id = ? ORDER BY position, id')
    .all(bookId) as RawMap[];
  return rows.map(toMap);
}

export function getMap(db: Db, id: string): StoryMap | null {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as RawMap | undefined;
  return row ? toMap(row) : null;
}

/** The column as stored, so a damaged map can still be duplicated without losing anything. */
export function getMapRawData(db: Db, id: string): string | null {
  const row = db.prepare('SELECT data FROM maps WHERE id = ?').get(id) as
    { data: string } | undefined;
  return row ? row.data : null;
}

export interface NewMapRow {
  id: string;
  bookId: string;
  title: string;
  template: string;
  data: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export function insertMap(db: Db, map: NewMapRow): void {
  db.prepare(
    `INSERT INTO maps (id, book_id, title, template, data, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    map.id,
    map.bookId,
    map.title,
    map.template,
    map.data,
    map.position,
    map.createdAt,
    map.updatedAt,
  );
}

export function updateMapTitle(db: Db, id: string, title: string, now: string): void {
  db.prepare('UPDATE maps SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
}

export function updateMapData(db: Db, id: string, data: MapData, now: string): void {
  db.prepare('UPDATE maps SET data = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(data),
    now,
    id,
  );
}

export function deleteMapRow(db: Db, id: string): void {
  db.prepare('DELETE FROM maps WHERE id = ?').run(id);
}

export function setMapPositions(db: Db, orderedIds: readonly string[]): void {
  const stmt = db.prepare('UPDATE maps SET position = ? WHERE id = ?');
  orderedIds.forEach((id, index) => stmt.run(index, id));
}

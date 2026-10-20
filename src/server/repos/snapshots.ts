import type { SnapshotReason } from '../../shared/schemas/snapshot.ts';
import type { Db } from '../db/connection.ts';

export interface SnapshotRow {
  id: string;
  nodeId: string;
  content: string;
  wordCount: number;
  reason: SnapshotReason;
  createdAt: string;
}

interface RawSnapshot {
  id: string;
  node_id: string;
  content: string;
  word_count: number;
  reason: SnapshotReason;
  created_at: string;
}

function toSnapshot(row: RawSnapshot): SnapshotRow {
  return {
    id: row.id,
    nodeId: row.node_id,
    content: row.content,
    wordCount: row.word_count,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function insertSnapshot(db: Db, snapshot: SnapshotRow): void {
  db.prepare(
    `INSERT INTO snapshots (id, node_id, content, word_count, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    snapshot.id,
    snapshot.nodeId,
    snapshot.content,
    snapshot.wordCount,
    snapshot.reason,
    snapshot.createdAt,
  );
}

/** Newest first. */
export function listSnapshots(db: Db, nodeId: string): SnapshotRow[] {
  const rows = db
    .prepare('SELECT * FROM snapshots WHERE node_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(nodeId) as RawSnapshot[];
  return rows.map(toSnapshot);
}

export function getSnapshot(db: Db, id: string): SnapshotRow | null {
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as RawSnapshot | undefined;
  return row ? toSnapshot(row) : null;
}

export function newestSnapshotAt(db: Db, nodeId: string): string | null {
  const row = db
    .prepare('SELECT MAX(created_at) AS at FROM snapshots WHERE node_id = ?')
    .get(nodeId) as { at: string | null };
  return row.at;
}

/** Keeps the newest `keep` snapshots of a section and deletes the rest. */
export function pruneSnapshots(db: Db, nodeId: string, keep: number): void {
  db.prepare(
    `DELETE FROM snapshots WHERE node_id = ? AND rowid NOT IN (
       SELECT rowid FROM snapshots WHERE node_id = ?
        ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
  ).run(nodeId, nodeId, keep);
}

/** Every snapshot of the book's sections, for the optional cold backup content. */
export function listBookSnapshots(db: Db, bookId: string): SnapshotRow[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM snapshots s JOIN nodes n ON n.id = s.node_id
        WHERE n.book_id = ? ORDER BY s.created_at, s.rowid`,
    )
    .all(bookId) as RawSnapshot[];
  return rows.map(toSnapshot);
}

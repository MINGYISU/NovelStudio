import {
  DEFAULT_THREAD_COLOR,
  FORESHADOW_STATUSES,
  type ForeshadowStatus,
  type Occurrence,
  type OccurrenceRole,
  type Thread,
} from '../../shared/schemas/foreshadow.ts';
import type { Db } from '../db/connection.ts';

interface RawThread {
  id: string;
  book_id: string;
  title: string;
  description: string;
  status: string;
  color: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface RawOccurrence {
  id: string;
  foreshadow_id: string;
  node_id: string | null;
  role: OccurrenceRole;
  excerpt: string;
  note: string;
  anchored: number;
  anchor_state: string | null;
  created_at: string;
}

function toOccurrence(row: RawOccurrence): Occurrence {
  return {
    id: row.id,
    foreshadowId: row.foreshadow_id,
    nodeId: row.node_id,
    role: row.role,
    excerpt: row.excerpt,
    note: row.note,
    anchored: row.anchored === 1,
    anchorState:
      row.anchor_state === 'present' || row.anchor_state === 'missing' ? row.anchor_state : null,
    createdAt: row.created_at,
  };
}

/** A stored status or color this version does not know is shown as the default; the row is not rewritten. */
function toThread(row: RawThread, occurrences: Occurrence[]): Thread {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    description: row.description,
    status: (FORESHADOW_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as ForeshadowStatus)
      : 'planned',
    color: /^#[0-9a-fA-F]{6}$/.test(row.color) ? row.color : DEFAULT_THREAD_COLOR,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    occurrences,
  };
}

export function listThreads(db: Db, bookId: string): Thread[] {
  const threads = db
    .prepare('SELECT * FROM foreshadows WHERE book_id = ? ORDER BY created_at, rowid')
    .all(bookId) as RawThread[];
  const occurrences = db
    .prepare(
      `SELECT o.* FROM foreshadow_occurrences o
       JOIN foreshadows f ON f.id = o.foreshadow_id
       WHERE f.book_id = ? ORDER BY o.created_at, o.rowid`,
    )
    .all(bookId) as RawOccurrence[];
  const byThread = new Map<string, Occurrence[]>();
  for (const row of occurrences) {
    const list = byThread.get(row.foreshadow_id) ?? [];
    list.push(toOccurrence(row));
    byThread.set(row.foreshadow_id, list);
  }
  return threads.map((row) => toThread(row, byThread.get(row.id) ?? []));
}

export function getThread(db: Db, id: string): Thread | null {
  const row = db.prepare('SELECT * FROM foreshadows WHERE id = ?').get(id) as RawThread | undefined;
  if (!row) return null;
  const occurrences = db
    .prepare(
      'SELECT * FROM foreshadow_occurrences WHERE foreshadow_id = ? ORDER BY created_at, rowid',
    )
    .all(id) as RawOccurrence[];
  return toThread(row, occurrences.map(toOccurrence));
}

export function getOccurrence(db: Db, id: string): Occurrence | null {
  const row = db.prepare('SELECT * FROM foreshadow_occurrences WHERE id = ?').get(id) as
    RawOccurrence | undefined;
  return row ? toOccurrence(row) : null;
}

export interface NewThreadRow {
  id: string;
  bookId: string;
  title: string;
  description: string;
  status: string;
  color: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function insertThread(db: Db, t: NewThreadRow): void {
  db.prepare(
    `INSERT INTO foreshadows (id, book_id, title, description, status, color, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    t.id,
    t.bookId,
    t.title,
    t.description,
    t.status,
    t.color,
    t.notes,
    t.createdAt,
    t.updatedAt,
  );
}

export interface ThreadFieldsUpdate {
  title?: string;
  description?: string;
  status?: string;
  color?: string;
  notes?: string;
}

export function updateThreadFields(
  db: Db,
  id: string,
  update: ThreadFieldsUpdate,
  now: string,
): void {
  const columns: string[] = [];
  const values: string[] = [];
  for (const key of ['title', 'description', 'status', 'color', 'notes'] as const) {
    const value = update[key];
    if (value !== undefined) {
      columns.push(`${key} = ?`);
      values.push(value);
    }
  }
  columns.push('updated_at = ?');
  values.push(now);
  db.prepare(`UPDATE foreshadows SET ${columns.join(', ')} WHERE id = ?`).run(...values, id);
}

export function deleteThreadRow(db: Db, id: string): void {
  db.prepare('DELETE FROM foreshadows WHERE id = ?').run(id);
}

export interface NewOccurrenceRow {
  id: string;
  foreshadowId: string;
  nodeId: string | null;
  role: OccurrenceRole;
  excerpt: string;
  note: string;
  anchored: boolean;
  anchorState: 'present' | 'missing' | null;
  createdAt: string;
}

export function insertOccurrence(db: Db, o: NewOccurrenceRow): void {
  db.prepare(
    `INSERT INTO foreshadow_occurrences
       (id, foreshadow_id, node_id, role, excerpt, note, anchored, anchor_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    o.id,
    o.foreshadowId,
    o.nodeId,
    o.role,
    o.excerpt,
    o.note,
    o.anchored ? 1 : 0,
    o.anchorState,
    o.createdAt,
  );
}

export interface OccurrenceFieldsUpdate {
  nodeId?: string;
  role?: OccurrenceRole;
  excerpt?: string;
  note?: string;
}

export function updateOccurrenceFields(db: Db, id: string, update: OccurrenceFieldsUpdate): void {
  const columns: string[] = [];
  const values: string[] = [];
  const map = { nodeId: 'node_id', role: 'role', excerpt: 'excerpt', note: 'note' } as const;
  for (const key of Object.keys(map) as (keyof typeof map)[]) {
    const value = update[key];
    if (value !== undefined) {
      columns.push(`${map[key]} = ?`);
      values.push(value);
    }
  }
  if (columns.length === 0) return;
  db.prepare(`UPDATE foreshadow_occurrences SET ${columns.join(', ')} WHERE id = ?`).run(
    ...values,
    id,
  );
}

export function deleteOccurrenceRow(db: Db, id: string): void {
  db.prepare('DELETE FROM foreshadow_occurrences WHERE id = ?').run(id);
}

/**
 * Brings occurrences in line with the anchors found in a section's saved text (ARCHITECTURE §11).
 * Ids that are not occurrences of this book are ignored, so text pasted from another book cannot
 * take over an occurrence.
 */
export function syncAnchors(
  db: Db,
  bookId: string,
  nodeId: string,
  anchorIds: ReadonlySet<string>,
): void {
  const found = [...anchorIds];
  if (found.length > 0) {
    const mark = db.prepare(
      `UPDATE foreshadow_occurrences
          SET node_id = ?, anchored = 1, anchor_state = 'present'
        WHERE id = ?
          AND foreshadow_id IN (SELECT id FROM foreshadows WHERE book_id = ?)
          AND (node_id IS NOT ? OR anchored != 1 OR anchor_state IS NOT 'present')`,
    );
    for (const id of found) mark.run(nodeId, id, bookId, nodeId);
  }
  const previous = db
    .prepare(
      `SELECT id FROM foreshadow_occurrences
        WHERE node_id = ? AND anchored = 1 AND anchor_state IS NOT 'missing'`,
    )
    .all(nodeId) as { id: string }[];
  const miss = db.prepare(
    "UPDATE foreshadow_occurrences SET anchor_state = 'missing' WHERE id = ?",
  );
  for (const { id } of previous) if (!anchorIds.has(id)) miss.run(id);
}

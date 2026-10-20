import type { TreeNode } from '../../shared/types.ts';
import type { Db } from '../db/connection.ts';

interface RawNode {
  id: string;
  book_id: string;
  parent_id: string | null;
  kind: TreeNode['kind'];
  title: string;
  position: number;
  numbered: number;
  status: TreeNode['status'];
  synopsis: string;
  word_count: number;
  deleted_at: string | null;
}

const COLUMNS =
  'id, book_id, parent_id, kind, title, position, numbered, status, synopsis, word_count, deleted_at';

function toNode(row: RawNode): TreeNode {
  return {
    id: row.id,
    bookId: row.book_id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    position: row.position,
    numbered: row.numbered === 1,
    status: row.status,
    synopsis: row.synopsis,
    wordCount: row.word_count,
    deletedAt: row.deleted_at,
  };
}

/** Every node of the book, trashed ones included, without content. */
export function listNodes(db: Db, bookId: string): TreeNode[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM nodes WHERE book_id = ? ORDER BY parent_id, position, id`)
    .all(bookId) as RawNode[];
  return rows.map(toNode);
}

export function getNode(db: Db, id: string): TreeNode | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM nodes WHERE id = ?`).get(id) as
    RawNode | undefined;
  return row ? toNode(row) : null;
}

export function insertNodeRow(db: Db, node: TreeNode, now: string): void {
  db.prepare(
    `INSERT INTO nodes (id, book_id, parent_id, kind, title, position, numbered, status, synopsis,
                        word_count, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    node.wordCount,
    now,
    now,
    node.deletedAt,
  );
}

/** Copies a section row, including its content, under a new id; snapshots are not copied. */
export function copyNodeRow(
  db: Db,
  sourceId: string,
  copy: { id: string; parentId: string | null; position: number; title: string },
  now: string,
): void {
  db.prepare(
    `INSERT INTO nodes (id, book_id, parent_id, kind, title, position, numbered, status, synopsis,
                        content, plain_text, word_count, rev, created_at, updated_at, deleted_at)
     SELECT ?, book_id, ?, kind, ?, ?, numbered, status, synopsis,
            content, plain_text, word_count, 0, ?, ?, NULL
       FROM nodes WHERE id = ?`,
  ).run(copy.id, copy.parentId, copy.title, copy.position, now, now, sourceId);
}

/** Writes parent, position and trash state only; titles, content and updated_at stay untouched. */
export function writeStructure(db: Db, nodes: readonly TreeNode[]): void {
  const stmt = db.prepare(
    'UPDATE nodes SET parent_id = ?, position = ?, deleted_at = ? WHERE id = ?',
  );
  for (const n of nodes) stmt.run(n.parentId, n.position, n.deletedAt, n.id);
}

export interface NodeFieldsUpdate {
  title?: string;
  status?: TreeNode['status'];
  synopsis?: string;
  numbered?: boolean;
}

export function updateNodeFields(db: Db, id: string, update: NodeFieldsUpdate, now: string): void {
  const columns: string[] = [];
  const values: (string | number)[] = [];
  if (update.title !== undefined) {
    columns.push('title = ?');
    values.push(update.title);
  }
  if (update.status !== undefined) {
    columns.push('status = ?');
    values.push(update.status);
  }
  if (update.synopsis !== undefined) {
    columns.push('synopsis = ?');
    values.push(update.synopsis);
  }
  if (update.numbered !== undefined) {
    columns.push('numbered = ?');
    values.push(update.numbered ? 1 : 0);
  }
  columns.push('updated_at = ?');
  values.push(now);
  db.prepare(`UPDATE nodes SET ${columns.join(', ')} WHERE id = ?`).run(...values, id);
}

/** Sets body text directly; used by the dev seed until content saving arrives with the editor. */
export function setNodeText(
  db: Db,
  id: string,
  text: { content: string; plainText: string; wordCount: number },
): void {
  db.prepare('UPDATE nodes SET content = ?, plain_text = ?, word_count = ? WHERE id = ?').run(
    text.content,
    text.plainText,
    text.wordCount,
    id,
  );
}

export function touchBook(db: Db, bookId: string, now: string): void {
  db.prepare('UPDATE books SET updated_at = ? WHERE id = ?').run(now, bookId);
}

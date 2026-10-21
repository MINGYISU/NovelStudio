import { ANCHOR_MARK, stripAnchors } from '../../shared/foreshadow-anchors.ts';
import type { ContentDoc } from '../../shared/schemas/content.ts';
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

/**
 * Copies a section row, including its content, under a new id; snapshots are not copied.
 * Foreshadow anchors stay with the original: a copy that kept them would take the occurrence over.
 */
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
  const row = db.prepare('SELECT content FROM nodes WHERE id = ?').get(copy.id) as
    { content: string } | undefined;
  if (row?.content.includes(ANCHOR_MARK)) {
    try {
      const content = JSON.stringify(stripAnchors(JSON.parse(row.content) as ContentDoc));
      db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(content, copy.id);
    } catch {
      // Unreadable stored text is copied unchanged, like any other copy.
    }
  }
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

/** Sets body text without touching `rev`; used by the dev seed. */
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

export interface NodeContentRow {
  id: string;
  bookId: string;
  deletedAt: string | null;
  content: string;
  plainText: string;
  wordCount: number;
  rev: number;
  updatedAt: string;
}

export function getNodeContentRow(db: Db, id: string): NodeContentRow | null {
  const row = db
    .prepare(
      `SELECT id, book_id, deleted_at, content, plain_text, word_count, rev, updated_at
         FROM nodes WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        book_id: string;
        deleted_at: string | null;
        content: string;
        plain_text: string;
        word_count: number;
        rev: number;
        updated_at: string;
      }
    | undefined;
  return row
    ? {
        id: row.id,
        bookId: row.book_id,
        deletedAt: row.deleted_at,
        content: row.content,
        plainText: row.plain_text,
        wordCount: row.word_count,
        rev: row.rev,
        updatedAt: row.updated_at,
      }
    : null;
}

/** Writes the body only if `rev` still matches; returns false when another save got there first. */
export function writeNodeContent(
  db: Db,
  id: string,
  expectedRev: number,
  text: { content: string; plainText: string; wordCount: number },
  now: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE nodes SET content = ?, plain_text = ?, word_count = ?, rev = rev + 1, updated_at = ?
        WHERE id = ? AND rev = ?`,
    )
    .run(text.content, text.plainText, text.wordCount, now, id, expectedRev);
  return result.changes === 1;
}

export function touchBook(db: Db, bookId: string, now: string): void {
  db.prepare('UPDATE books SET updated_at = ? WHERE id = ?').run(now, bookId);
}

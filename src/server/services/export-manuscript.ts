import { slugifyTitle } from '../../shared/cold-backup.ts';
import {
  renderManuscript,
  type ExportFormat,
  type ExportSection,
} from '../../shared/manuscript-export.ts';
import { computeDisplayTitles, UNTITLED } from '../../shared/numbering.ts';
import { contentSchema, type ContentDoc } from '../../shared/schemas/content.ts';
import { buildTree, type TreeBranch } from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/types.ts';
import type { Db } from '../db/connection.ts';
import { listLiveContentRows, listNodes } from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';

export interface ManuscriptDownload {
  fileName: string;
  contentType: string;
  body: string;
}

function parseDoc(content: string): ContentDoc | null {
  try {
    const parsed = contentSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** EXP-01: the live manuscript in reading order with display titles; trashed sections and their subtrees are left out. */
export function exportManuscript(
  db: Db,
  library: LibraryService,
  bookId: string,
  format: ExportFormat,
): ManuscriptDownload {
  const { book, nodes, rows } = db.transaction(() => ({
    book: library.requireBook(bookId),
    nodes: listNodes(db, bookId),
    rows: listLiveContentRows(db, bookId),
  }))();

  const titles = computeDisplayTitles(nodes, book.structure);
  const text = new Map(rows.map((r) => [r.id, r]));

  const sections: ExportSection[] = [];
  const walk = (branches: TreeBranch<TreeNode>[], depth: number): void => {
    for (const { node, children } of branches) {
      const row = text.get(node.id);
      sections.push({
        depth,
        displayTitle: titles.get(node.id) ?? (node.title || UNTITLED),
        doc: row ? parseDoc(row.content) : null,
        plainText: row?.plainText ?? '',
      });
      walk(children, depth + 1);
    }
  };
  walk(buildTree(nodes), 0);

  return {
    fileName: `${slugifyTitle(book.title)}.${format}`,
    contentType: format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
    body: renderManuscript({ title: book.title, author: book.author }, sections, format),
  };
}

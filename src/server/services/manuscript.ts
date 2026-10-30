import crypto from 'node:crypto';
import type { CreateNodeBody, MoveNodeBody, PatchNodeBody } from '../../shared/schemas/node.ts';
import { DEFAULT_LOCALE, type Locale } from '../../shared/schemas/locale.ts';
import { NODE_TITLE_MAX } from '../../shared/schemas/node.ts';
import { copyTitle } from '../../shared/seed-text.ts';
import {
  applyMove,
  insertNode,
  restoreNode,
  trashNode,
  TreeRuleError,
  type TreeChange,
} from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/types.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { getBookSettingsJson, parseStructure } from '../repos/books.ts';
import {
  copyNodeRow,
  getNode,
  insertNodeRow,
  listNodes,
  touchBook,
  updateNodeFields,
  writeStructure,
} from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';

const RULE_STATUS: Record<TreeRuleError['code'], number> = {
  NOT_FOUND: 404,
  INVALID_MOVE: 409,
  INVALID_PARENT: 409,
  NOT_TRASHED: 409,
  INVALID_INDEX: 400,
};

function toApiError(error: unknown): unknown {
  return error instanceof TreeRuleError
    ? new ApiError(RULE_STATUS[error.code], error.code, error.message)
    : error;
}

export class ManuscriptService {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
  ) {}

  tree(bookId: string): TreeNode[] {
    this.library.requireBook(bookId);
    return listNodes(this.db, bookId);
  }

  create(bookId: string, body: CreateNodeBody): { node: TreeNode; nodes: TreeNode[] } {
    return this.write(() => {
      this.library.requireLiveBook(bookId);
      const nodes = listNodes(this.db, bookId);
      const now = new Date().toISOString();
      const draft: TreeNode = {
        id: crypto.randomUUID(),
        bookId,
        parentId: body.parentId,
        kind: body.kind,
        title: body.title ?? '',
        position: 0,
        numbered: body.numbered ?? this.defaultNumbered(bookId, body.kind),
        status: 'draft',
        synopsis: '',
        wordCount: 0,
        deletedAt: null,
      };
      const siblingCount = nodes.filter(
        (n) => n.parentId === draft.parentId && n.deletedAt === null,
      ).length;
      const change = insertNode(nodes, draft, body.index ?? siblingCount);
      const inserted = change.changed.find((n) => n.id === draft.id) as TreeNode;
      insertNodeRow(this.db, inserted, now);
      writeStructure(
        this.db,
        change.changed.filter((n) => n.id !== draft.id),
      );
      touchBook(this.db, bookId, now);
      return { node: inserted, nodes: listNodes(this.db, bookId) };
    });
  }

  update(id: string, patch: PatchNodeBody): TreeNode {
    return this.write(() => {
      const node = this.requireNode(id);
      this.library.requireLiveBook(node.bookId);
      const now = new Date().toISOString();
      updateNodeFields(this.db, id, patch, now);
      touchBook(this.db, node.bookId, now);
      return this.requireNode(id);
    });
  }

  /** Copies a section with its live subtree right after the original; trashed descendants stay behind. */
  duplicate(id: string, locale: Locale = DEFAULT_LOCALE): { node: TreeNode; nodes: TreeNode[] } {
    return this.write(() => {
      const source = this.requireNode(id);
      this.library.requireLiveBook(source.bookId);
      if (source.deletedAt !== null) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
      const nodes = listNodes(this.db, source.bookId);
      const now = new Date().toISOString();
      const rootCopy: TreeNode = {
        ...source,
        id: crypto.randomUUID(),
        title: source.title ? copyTitle(source.title, locale).slice(0, NODE_TITLE_MAX) : '',
      };
      const siblings = nodes.filter((n) => n.parentId === source.parentId && n.deletedAt === null);
      const index = siblings.sort((a, b) => a.position - b.position).findIndex((n) => n.id === id);
      const change = insertNode(nodes, rootCopy, index + 1);
      const placed = change.changed.find((n) => n.id === rootCopy.id) as TreeNode;
      copyNodeRow(
        this.db,
        id,
        {
          id: placed.id,
          parentId: placed.parentId,
          position: placed.position,
          title: placed.title,
        },
        now,
      );
      writeStructure(
        this.db,
        change.changed.filter((n) => n.id !== placed.id),
      );
      const queue: [string, string][] = [[source.id, placed.id]];
      while (queue.length > 0) {
        const [oldParent, newParent] = queue.shift() as [string, string];
        const children = nodes
          .filter((n) => n.parentId === oldParent && n.deletedAt === null)
          .sort((a, b) => a.position - b.position);
        children.forEach((child, position) => {
          const childCopy = crypto.randomUUID();
          copyNodeRow(
            this.db,
            child.id,
            { id: childCopy, parentId: newParent, position, title: child.title },
            now,
          );
          queue.push([child.id, childCopy]);
        });
      }
      touchBook(this.db, source.bookId, now);
      return { node: placed, nodes: listNodes(this.db, source.bookId) };
    });
  }

  move(id: string, body: MoveNodeBody): TreeNode[] {
    return this.structural(id, (nodes) => applyMove(nodes, id, body.parentId, body.index));
  }

  trash(id: string): TreeNode[] {
    return this.structural(id, (nodes) => trashNode(nodes, id, new Date().toISOString()));
  }

  restore(id: string): TreeNode[] {
    return this.structural(id, (nodes) => restoreNode(nodes, id));
  }

  /** Loads the book's nodes, applies a pure tree change and persists it in one transaction. */
  private structural(id: string, change: (nodes: TreeNode[]) => TreeChange<TreeNode>): TreeNode[] {
    return this.write(() => {
      const node = this.requireNode(id);
      this.library.requireLiveBook(node.bookId);
      const result = change(listNodes(this.db, node.bookId));
      writeStructure(this.db, result.changed);
      touchBook(this.db, node.bookId, new Date().toISOString());
      return listNodes(this.db, node.bookId);
    });
  }

  private write<T>(fn: () => T): T {
    try {
      return this.db.transaction(fn)();
    } catch (error) {
      throw toApiError(error);
    }
  }

  private requireNode(id: string): TreeNode {
    const node = getNode(this.db, id);
    if (!node) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
    return node;
  }

  private defaultNumbered(bookId: string, kind: TreeNode['kind']): boolean {
    const structure = this.structure(bookId);
    return structure[kind].defaultNumbered;
  }

  private structure(bookId: string) {
    return parseStructure(getBookSettingsJson(this.db, bookId));
  }
}

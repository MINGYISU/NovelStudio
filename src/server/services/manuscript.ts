import crypto from 'node:crypto';
import type { CreateNodeBody, MoveNodeBody, PatchNodeBody } from '../../shared/schemas/node.ts';
import { bookSettingsSchema, DEFAULT_STRUCTURE } from '../../shared/schemas/structure.ts';
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
import { getBookSettingsJson } from '../repos/books.ts';
import {
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
    const raw = getBookSettingsJson(this.db, bookId);
    try {
      const parsed = bookSettingsSchema.safeParse(JSON.parse(raw ?? '{}'));
      return parsed.success ? parsed.data.structure : DEFAULT_STRUCTURE;
    } catch {
      return DEFAULT_STRUCTURE;
    }
  }
}

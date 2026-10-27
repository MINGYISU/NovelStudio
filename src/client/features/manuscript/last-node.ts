import { buildTree, type TreeBranch } from '../../../shared/tree.ts';
import type { TreeNode } from '../../../shared/types.ts';

const key = (bookId: string) => `novelstudio:lastNode:${bookId}`;

/** UI-only state (WS-02): the section last open per book, kept across restarts; not book data. */
export function loadLastNode(bookId: string): string | null {
  try {
    return localStorage.getItem(key(bookId));
  } catch {
    return null;
  }
}

export function saveLastNode(bookId: string, nodeId: string): void {
  try {
    localStorage.setItem(key(bookId), nodeId);
  } catch {
    // A convenience only; ignore storage failures.
  }
}

function isLive(nodes: readonly TreeNode[], id: string): boolean {
  const visit = (branches: TreeBranch<TreeNode>[]): boolean =>
    branches.some((b) => b.node.id === id || visit(b.children));
  return visit(buildTree(nodes));
}

/** The remembered section of a book if it is still in the tree (not trashed, nor under a trashed parent). */
export function rememberedSection(bookId: string, nodes: readonly TreeNode[]): string | null {
  const id = loadLastNode(bookId);
  return id !== null && isLive(nodes, id) ? id : null;
}

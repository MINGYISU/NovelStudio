import { computeDisplayTitles } from '../../../shared/numbering.ts';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import { buildTree, type TreeBranch } from '../../../shared/tree.ts';
import type { TreeNode } from '../../../shared/types.ts';

export interface TreeItem {
  id: string;
  node: TreeNode;
  displayTitle: string;
  /** null for scenes: they cannot hold sections, so react-arborist treats them as leaves. */
  children: TreeItem[] | null;
}

export function buildItems(
  nodes: readonly TreeNode[],
  structure: StructureSettings,
  untitled?: string,
): TreeItem[] {
  const titles = computeDisplayTitles(nodes, structure, untitled);
  const convert = (branch: TreeBranch<TreeNode>): TreeItem => ({
    id: branch.node.id,
    node: branch.node,
    displayTitle: titles.get(branch.node.id) ?? branch.node.title,
    children: branch.node.kind === 'scene' ? null : branch.children.map(convert),
  });
  return buildTree(nodes).map(convert);
}

/** The kind a "new child" gets: the next rank down; scenes cannot have children. */
export function childKindOf(kind: TreeNode['kind']): TreeNode['kind'] | null {
  return kind === 'volume'
    ? 'part'
    : kind === 'part'
      ? 'chapter'
      : kind === 'chapter'
        ? 'scene'
        : null;
}

export function totalWords(nodes: readonly TreeNode[]): number {
  return buildTree(nodes).reduce((sum, branch) => sum + branchWords(branch), 0);
}

function branchWords(branch: TreeBranch<TreeNode>): number {
  return branch.children.reduce((sum, c) => sum + branchWords(c), branch.node.wordCount);
}

export interface TrashEntry {
  node: TreeNode;
  /** Sections that come back with this one: itself and its descendants not trashed on their own. */
  sections: number;
  words: number;
}

/** The book's trash list (TREE-08): every trashed section, newest first. */
export function trashEntries(nodes: readonly TreeNode[]): TrashEntry[] {
  const children = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const list = children.get(n.parentId) ?? [];
    list.push(n);
    children.set(n.parentId, list);
  }
  const measure = (node: TreeNode): { sections: number; words: number } =>
    (children.get(node.id) ?? [])
      .filter((c) => c.deletedAt === null)
      .map(measure)
      .reduce((a, b) => ({ sections: a.sections + b.sections, words: a.words + b.words }), {
        sections: 1,
        words: node.wordCount,
      });
  return nodes
    .filter((n) => n.deletedAt !== null)
    .map((node) => ({ node, ...measure(node) }))
    .sort((a, b) => (b.node.deletedAt ?? '').localeCompare(a.node.deletedAt ?? ''));
}

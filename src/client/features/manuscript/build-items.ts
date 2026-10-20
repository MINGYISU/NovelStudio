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

export function buildItems(nodes: readonly TreeNode[], structure: StructureSettings): TreeItem[] {
  const titles = computeDisplayTitles(nodes, structure);
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

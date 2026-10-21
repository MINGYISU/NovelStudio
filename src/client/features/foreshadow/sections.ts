import { resolveMapLink, type ResolvedLink, type LinkTarget } from '../../../shared/map-links.ts';
import { buildTree, type TreeBranch } from '../../../shared/tree.ts';
import type { TreeNode } from '../../../shared/types.ts';

export interface SectionOption {
  id: string;
  label: string;
  depth: number;
}

/** Live sections in reading order with their current display titles, for pickers. */
export function sectionOptions(
  nodes: readonly TreeNode[],
  targets: ReadonlyMap<string, LinkTarget>,
): SectionOption[] {
  const walk = (branches: TreeBranch<TreeNode>[], depth: number): SectionOption[] =>
    branches.flatMap(({ node, children }) => [
      { id: node.id, label: targets.get(node.id)?.title ?? node.title, depth },
      ...walk(children, depth + 1),
    ]);
  return walk(buildTree(nodes), 0);
}

const NO_ENTRIES: ReadonlyMap<string, string> = new Map();

/** The section's current display title, or a note that it is in the trash or gone. */
export function describeSection(
  nodeId: string | null,
  targets: ReadonlyMap<string, LinkTarget>,
): ResolvedLink {
  return nodeId === null
    ? { label: '(missing)', state: 'missing' }
    : resolveMapLink({ type: 'node', id: nodeId }, targets, NO_ENTRIES);
}

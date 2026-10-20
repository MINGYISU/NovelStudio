export const NODE_KINDS = ['volume', 'part', 'chapter', 'scene'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Lower rank = higher in the hierarchy. A section may only live under a strictly lower rank. */
export const NODE_RANK: Record<NodeKind, number> = {
  volume: 0,
  part: 1,
  chapter: 2,
  scene: 3,
};

export function rank(kind: NodeKind): number {
  return NODE_RANK[kind];
}

export const NODE_STATUSES = ['idea', 'draft', 'revising', 'done'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

/** A manuscript section as listed in the tree (no content). */
export interface TreeNode {
  id: string;
  bookId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  position: number;
  numbered: boolean;
  status: NodeStatus;
  synopsis: string;
  wordCount: number;
  deletedAt: string | null;
}

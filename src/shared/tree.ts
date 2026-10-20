import { rank, type NodeKind } from './types.ts';

/** The fields tree logic needs; callers may pass richer node objects, which are preserved. */
export interface StructuralNode {
  id: string;
  bookId: string;
  parentId: string | null;
  kind: NodeKind;
  position: number;
  deletedAt: string | null;
}

export type TreeRuleCode =
  'NOT_FOUND' | 'INVALID_MOVE' | 'INVALID_INDEX' | 'INVALID_PARENT' | 'NOT_TRASHED';

export class TreeRuleError extends Error {
  override name = 'TreeRuleError';

  constructor(
    readonly code: TreeRuleCode,
    message: string,
  ) {
    super(message);
  }
}

export type RuleCheck = { ok: true } | { ok: false; code: TreeRuleCode; message: string };

export class TreeInvariantError extends Error {
  override name = 'TreeInvariantError';

  constructor(readonly problems: string[]) {
    super(`Tree invariants violated:\n- ${problems.join('\n- ')}`);
  }
}

export interface TreeChange<T> {
  /** The full node list after the change. */
  nodes: T[];
  /** Only the nodes whose parent, position or trash state differ from the input. */
  changed: T[];
}

export interface TreeBranch<T> {
  node: T;
  children: TreeBranch<T>[];
}

type Liveness = 'live' | 'trashed' | 'orphan' | 'cycle';

/**
 * A node is live when neither it nor any ancestor is trashed. Trashing marks only the subtree root,
 * so descendants of a trashed section count as trashed too.
 * All functions here work on the nodes of ONE book.
 */
function classify(nodes: readonly StructuralNode[]): Map<string, Liveness> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result = new Map<string, Liveness>();
  for (const start of nodes) {
    if (result.has(start.id)) continue;
    const path: StructuralNode[] = [];
    const inPath = new Set<string>();
    let current = start;
    let verdict: Liveness;
    for (;;) {
      const known = result.get(current.id);
      if (known) {
        verdict = known;
        break;
      }
      if (inPath.has(current.id)) {
        verdict = 'cycle';
        break;
      }
      path.push(current);
      inPath.add(current.id);
      if (current.deletedAt !== null) {
        verdict = 'trashed';
        break;
      }
      if (current.parentId === null) {
        verdict = 'live';
        break;
      }
      const parent = byId.get(current.parentId);
      if (!parent) {
        verdict = 'orphan';
        break;
      }
      current = parent;
    }
    for (const n of path) result.set(n.id, verdict);
  }
  return result;
}

function byPosition(a: StructuralNode, b: StructuralNode): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

function liveChildren<T extends StructuralNode>(
  nodes: readonly T[],
  live: Map<string, Liveness>,
  parentId: string | null,
): T[] {
  return nodes.filter((n) => n.parentId === parentId && live.get(n.id) === 'live').sort(byPosition);
}

export function isDescendant(
  nodes: readonly StructuralNode[],
  nodeId: string,
  ancestorId: string,
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let current = byId.get(nodeId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** Live nodes as a nested structure, siblings ordered by position. */
export function buildTree<T extends StructuralNode>(nodes: readonly T[]): TreeBranch<T>[] {
  const live = classify(nodes);
  const grouped = new Map<string | null, T[]>();
  for (const n of nodes) {
    if (live.get(n.id) !== 'live') continue;
    const list = grouped.get(n.parentId);
    if (list) list.push(n);
    else grouped.set(n.parentId, [n]);
  }
  const build = (parentId: string | null): TreeBranch<T>[] =>
    (grouped.get(parentId) ?? []).sort(byPosition).map((node) => ({
      node,
      children: build(node.id),
    }));
  return build(null);
}

export function assertTreeInvariants(nodes: readonly StructuralNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const live = classify(nodes);
  const problems: string[] = [];
  const siblings = new Map<string, number[]>();

  for (const node of nodes) {
    const state = live.get(node.id);
    if (state === 'orphan') problems.push(`${node.id}: parent ${node.parentId} does not exist`);
    if (state === 'cycle') problems.push(`${node.id}: is part of a cycle`);
    if (state !== 'live') continue;

    if (node.parentId !== null) {
      const parent = byId.get(node.parentId);
      if (parent && parent.bookId !== node.bookId) {
        problems.push(`${node.id}: parent ${parent.id} belongs to another book`);
      }
      if (parent && rank(node.kind) <= rank(parent.kind)) {
        problems.push(`${node.id}: ${node.kind} cannot be under a ${parent.kind}`);
      }
    }
    const key = `${node.bookId}|${node.parentId ?? ''}`;
    const positions = siblings.get(key);
    if (positions) positions.push(node.position);
    else siblings.set(key, [node.position]);
  }

  for (const [key, positions] of siblings) {
    const sorted = [...positions].sort((a, b) => a - b);
    if (sorted.some((p, i) => p !== i)) {
      problems.push(
        `siblings of ${key}: positions [${sorted.join(', ')}] are not 0..${sorted.length - 1}`,
      );
    }
  }
  if (problems.length > 0) throw new TreeInvariantError(problems);
}

function fail(code: TreeRuleCode, message: string): RuleCheck {
  return { ok: false, code, message };
}

/** Non-throwing form of {@link validateMove}, usable for drop targets on the client. */
export function checkMove(
  nodes: readonly StructuralNode[],
  nodeId: string,
  newParentId: string | null,
  index: number,
): RuleCheck {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const live = classify(nodes);
  const node = byId.get(nodeId);
  if (!node || live.get(node.id) !== 'live') return fail('NOT_FOUND', 'Section not found.');

  if (newParentId !== null) {
    const parent = byId.get(newParentId);
    if (!parent || live.get(parent.id) !== 'live' || parent.bookId !== node.bookId) {
      return fail('NOT_FOUND', 'Destination section not found.');
    }
    if (parent.id === node.id || isDescendant(nodes, parent.id, node.id)) {
      return fail('INVALID_MOVE', 'A section cannot be moved into itself or its own descendant.');
    }
    if (rank(node.kind) <= rank(parent.kind)) {
      return fail('INVALID_MOVE', `A ${node.kind} cannot be placed inside a ${parent.kind}.`);
    }
  }

  const destSize = liveChildren(nodes, live, newParentId).filter((n) => n.id !== node.id).length;
  if (!Number.isInteger(index) || index < 0 || index > destSize) {
    return fail('INVALID_INDEX', `Index must be between 0 and ${destSize}.`);
  }
  return { ok: true };
}

function throwIfFailed(check: RuleCheck): void {
  if (!check.ok) throw new TreeRuleError(check.code, check.message);
}

export function validateMove(
  nodes: readonly StructuralNode[],
  nodeId: string,
  newParentId: string | null,
  index: number,
): void {
  throwIfFailed(checkMove(nodes, nodeId, newParentId, index));
}

/** Re-packs `list` to positions 0..n-1 under `parentId`, merging into `patches`. */
function repack<T extends StructuralNode>(
  list: readonly T[],
  parentId: string | null,
  patches: Map<string, Pick<StructuralNode, 'parentId' | 'position'>>,
): void {
  list.forEach((n, position) => patches.set(n.id, { parentId, position }));
}

function applyPatches<T extends StructuralNode>(
  nodes: readonly T[],
  patches: Map<string, Partial<StructuralNode>>,
): TreeChange<T> {
  const changed: T[] = [];
  const next = nodes.map((n) => {
    const patch = patches.get(n.id);
    if (!patch) return n;
    const differs = (Object.keys(patch) as (keyof StructuralNode)[]).some(
      (key) => patch[key] !== n[key],
    );
    if (!differs) return n;
    const updated = { ...n, ...patch };
    changed.push(updated);
    return updated;
  });
  return { nodes: next, changed };
}

/**
 * `index` is the final index in the destination's live children after the node has been removed
 * from its old list. Descendants are untouched: they follow because only the node's parent changes.
 */
export function applyMove<T extends StructuralNode>(
  nodes: readonly T[],
  nodeId: string,
  newParentId: string | null,
  index: number,
): TreeChange<T> {
  validateMove(nodes, nodeId, newParentId, index);
  const live = classify(nodes);
  const node = nodes.find((n) => n.id === nodeId) as T;
  const oldSiblings = liveChildren(nodes, live, node.parentId).filter((n) => n.id !== node.id);
  const dest =
    node.parentId === newParentId
      ? oldSiblings
      : liveChildren(nodes, live, newParentId).filter((n) => n.id !== node.id);

  const patches = new Map<string, Pick<StructuralNode, 'parentId' | 'position'>>();
  if (node.parentId !== newParentId) repack(oldSiblings, node.parentId, patches);
  const ordered = [...dest];
  ordered.splice(index, 0, node);
  repack(ordered, newParentId, patches);
  return applyPatches(nodes, patches);
}

/** Trashes the subtree root only and closes the gap among its old siblings. */
export function trashNode<T extends StructuralNode>(
  nodes: readonly T[],
  nodeId: string,
  now: string,
): TreeChange<T> {
  const live = classify(nodes);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || live.get(node.id) !== 'live') {
    throw new TreeRuleError('NOT_FOUND', 'Section not found.');
  }
  const patches = new Map<string, Partial<StructuralNode>>();
  const remaining = liveChildren(nodes, live, node.parentId).filter((n) => n.id !== node.id);
  remaining.forEach((n, position) => patches.set(n.id, { position }));
  patches.set(node.id, { deletedAt: now });
  return applyPatches(nodes, patches);
}

/**
 * Appends to the original parent when it is still live and the rank rule holds; otherwise to the
 * book root. Only a trashed subtree root can be restored.
 */
export function restoreNode<T extends StructuralNode>(
  nodes: readonly T[],
  nodeId: string,
): TreeChange<T> {
  const live = classify(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) throw new TreeRuleError('NOT_FOUND', 'Section not found.');
  if (node.deletedAt === null) {
    throw new TreeRuleError('NOT_TRASHED', 'This section is not in the trash.');
  }
  const parent = node.parentId === null ? undefined : byId.get(node.parentId);
  const parentUsable =
    parent !== undefined &&
    live.get(parent.id) === 'live' &&
    parent.bookId === node.bookId &&
    rank(node.kind) > rank(parent.kind);
  const destParentId = parentUsable ? node.parentId : null;
  const position = liveChildren(nodes, live, destParentId).length;
  return applyPatches(
    nodes,
    new Map([[node.id, { parentId: destParentId, position, deletedAt: null }]]),
  );
}

/** Inserts a new live node at `index` among the live children of its parent. */
export function insertNode<T extends StructuralNode>(
  nodes: readonly T[],
  node: T,
  index: number,
): TreeChange<T> {
  const live = classify(nodes);
  if (node.parentId !== null) {
    const parent = nodes.find((n) => n.id === node.parentId);
    if (!parent || live.get(parent.id) !== 'live' || parent.bookId !== node.bookId) {
      throw new TreeRuleError('NOT_FOUND', 'Parent section not found.');
    }
    if (rank(node.kind) <= rank(parent.kind)) {
      throw new TreeRuleError(
        'INVALID_PARENT',
        `A ${node.kind} cannot be placed inside a ${parent.kind}.`,
      );
    }
  }
  const siblings = liveChildren(nodes, live, node.parentId);
  if (!Number.isInteger(index) || index < 0 || index > siblings.length) {
    throw new TreeRuleError('INVALID_INDEX', `Index must be between 0 and ${siblings.length}.`);
  }
  const ordered = [...siblings];
  ordered.splice(index, 0, { ...node, deletedAt: null });
  const patches = new Map<string, Pick<StructuralNode, 'parentId' | 'position'>>();
  repack(ordered, node.parentId, patches);
  const base = applyPatches(nodes, patches);
  const inserted = { ...node, deletedAt: null, position: index };
  return { nodes: [...base.nodes, inserted], changed: [...base.changed, inserted] };
}

/**
 * Converts the index react-arborist reports in `onMove` (position in the destination list that
 * still contains the dragged node) to the final index used by the API. Moving down within the same
 * parent shifts everything below the dragged node up by one, so the index drops by one.
 */
export function arboristIndexToFinalIndex(
  nodes: readonly StructuralNode[],
  nodeId: string,
  destParentId: string | null,
  arboristIndex: number,
): number {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.parentId !== destParentId) return arboristIndex;
  const siblings = liveChildren(nodes, classify(nodes), destParentId);
  const current = siblings.findIndex((n) => n.id === nodeId);
  return current !== -1 && current < arboristIndex ? arboristIndex - 1 : arboristIndex;
}

export type KeyboardMove = 'up' | 'down' | 'indent' | 'outdent';

/**
 * Translates `Alt+↑/↓`, `Tab` and `Shift+Tab` into a `(parentId, index)` move (index in the API's
 * final-index meaning). Returns null when the move is impossible or breaks a rule.
 */
export function keyboardMoveTarget(
  nodes: readonly StructuralNode[],
  nodeId: string,
  move: KeyboardMove,
): { parentId: string | null; index: number } | null {
  const live = classify(nodes);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || live.get(node.id) !== 'live') return null;
  const siblings = liveChildren(nodes, live, node.parentId);
  const at = siblings.findIndex((n) => n.id === nodeId);

  let target: { parentId: string | null; index: number } | null = null;
  if (move === 'up') {
    if (at > 0) target = { parentId: node.parentId, index: at - 1 };
  } else if (move === 'down') {
    if (at < siblings.length - 1) target = { parentId: node.parentId, index: at + 1 };
  } else if (move === 'indent') {
    const previous = siblings[at - 1];
    if (previous) {
      target = {
        parentId: previous.id,
        index: liveChildren(nodes, live, previous.id).length,
      };
    }
  } else if (node.parentId !== null) {
    const parent = nodes.find((n) => n.id === node.parentId);
    if (parent) {
      const parentSiblings = liveChildren(nodes, live, parent.parentId);
      target = {
        parentId: parent.parentId,
        index: parentSiblings.findIndex((n) => n.id === parent.id) + 1,
      };
    }
  }
  if (!target || !checkMove(nodes, nodeId, target.parentId, target.index).ok) return null;
  return target;
}

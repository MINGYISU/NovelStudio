import { describe, expect, it } from 'vitest';
import {
  applyMove,
  arboristIndexToFinalIndex,
  assertTreeInvariants,
  buildTree,
  checkMove,
  insertNode,
  isDescendant,
  keyboardMoveTarget,
  restoreNode,
  trashNode,
  TreeInvariantError,
  TreeRuleError,
  validateMove,
  type StructuralNode,
} from './tree.ts';
import type { NodeKind } from './types.ts';

interface N extends StructuralNode {
  title: string;
}

function node(
  id: string,
  kind: NodeKind,
  parentId: string | null,
  position: number,
  deletedAt: string | null = null,
): N {
  return { id, bookId: 'b1', parentId, kind, position, deletedAt, title: id };
}

/**
 * V1
 * ├─ P1
 * │  ├─ C1
 * │  │  └─ S1
 * │  └─ C2
 * └─ P2
 *    └─ C3
 * C4 (book root)
 * C5 (book root)
 */
function sample(): N[] {
  return [
    node('V1', 'volume', null, 0),
    node('P1', 'part', 'V1', 0),
    node('C1', 'chapter', 'P1', 0),
    node('S1', 'scene', 'C1', 0),
    node('C2', 'chapter', 'P1', 1),
    node('P2', 'part', 'V1', 1),
    node('C3', 'chapter', 'P2', 0),
    node('C4', 'chapter', null, 1),
    node('C5', 'chapter', null, 2),
  ];
}

function order(nodes: N[], parentId: string | null): string[] {
  return nodes
    .filter((n) => n.parentId === parentId && n.deletedAt === null)
    .sort((a, b) => a.position - b.position)
    .map((n) => n.id);
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof TreeRuleError) return error.code;
    throw error;
  }
  return undefined;
}

describe('rank rule (TREE-01, MOVE-05)', () => {
  it('allows a section under a strictly higher-ranked parent', () => {
    expect(checkMove(sample(), 'C4', 'P1', 0).ok).toBe(true);
    expect(checkMove(sample(), 'S1', 'C2', 0).ok).toBe(true);
  });

  it('allows skipping levels and the book root', () => {
    expect(checkMove(sample(), 'S1', 'V1', 0).ok).toBe(true);
    expect(checkMove(sample(), 'S1', null, 0).ok).toBe(true);
    expect(checkMove(sample(), 'C4', 'V1', 2).ok).toBe(true);
    expect(checkMove(sample(), 'P2', null, 0).ok).toBe(true);
  });

  it('rejects equal rank', () => {
    expect(codeOf(() => validateMove(sample(), 'C4', 'C5', 0))).toBe('INVALID_MOVE');
    expect(codeOf(() => validateMove(sample(), 'P2', 'P1', 0))).toBe('INVALID_MOVE');
  });

  it('rejects a lower-ranked parent', () => {
    expect(codeOf(() => validateMove(sample(), 'P1', 'C4', 0))).toBe('INVALID_MOVE');
    expect(codeOf(() => validateMove(sample(), 'V1', 'S1', 0))).toBe('INVALID_MOVE');
  });
});

describe('cycles (MOVE-05)', () => {
  it('rejects moving a section into itself', () => {
    expect(codeOf(() => validateMove(sample(), 'P1', 'P1', 0))).toBe('INVALID_MOVE');
  });

  it('rejects moving a section into its own descendant', () => {
    expect(codeOf(() => validateMove(sample(), 'V1', 'S1', 0))).toBe('INVALID_MOVE');
    expect(codeOf(() => validateMove(sample(), 'V1', 'C2', 0))).toBe('INVALID_MOVE');
  });

  it('isDescendant follows the parent chain', () => {
    const nodes = sample();
    expect(isDescendant(nodes, 'S1', 'V1')).toBe(true);
    expect(isDescendant(nodes, 'S1', 'C1')).toBe(true);
    expect(isDescendant(nodes, 'V1', 'S1')).toBe(false);
    expect(isDescendant(nodes, 'V1', 'V1')).toBe(false);
    expect(isDescendant(nodes, 'C4', 'V1')).toBe(false);
  });
});

describe('index semantics (§7.1)', () => {
  it('accepts 0 through the destination length, excluding the moved node', () => {
    expect(checkMove(sample(), 'C4', 'P1', 0).ok).toBe(true);
    expect(checkMove(sample(), 'C4', 'P1', 2).ok).toBe(true);
    expect(codeOf(() => validateMove(sample(), 'C4', 'P1', 3))).toBe('INVALID_INDEX');
  });

  it('excludes the moved node from the list when moving within the same parent', () => {
    // Root children are V1, C4, C5; without C4 there are two, so the last valid index is 2.
    expect(checkMove(sample(), 'C4', null, 2).ok).toBe(true);
    expect(codeOf(() => validateMove(sample(), 'C4', null, 3))).toBe('INVALID_INDEX');
  });

  it('rejects negative and non-integer indexes', () => {
    expect(codeOf(() => validateMove(sample(), 'C4', 'P1', -1))).toBe('INVALID_INDEX');
    expect(codeOf(() => validateMove(sample(), 'C4', 'P1', 0.5))).toBe('INVALID_INDEX');
  });

  it('places the node at the final index', () => {
    const { nodes } = applyMove(sample(), 'C5', 'P1', 1);
    expect(order(nodes, 'P1')).toEqual(['C1', 'C5', 'C2']);
  });

  it('moves up within the same parent', () => {
    const { nodes } = applyMove(sample(), 'C5', null, 0);
    expect(order(nodes, null)).toEqual(['C5', 'V1', 'C4']);
  });

  it('moves down within the same parent using the post-removal index', () => {
    const { nodes } = applyMove(sample(), 'V1', null, 2);
    expect(order(nodes, null)).toEqual(['C4', 'C5', 'V1']);
  });

  it('treats a move to the current place as a no-op', () => {
    const { nodes, changed } = applyMove(sample(), 'C4', null, 1);
    expect(changed).toEqual([]);
    expect(nodes).toEqual(sample());
  });
});

describe('applyMove (MOVE-03, MOVE-04, MOVE-07)', () => {
  it('moves the whole subtree because only the parent changes', () => {
    const { nodes, changed } = applyMove(sample(), 'C1', 'P2', 0);
    expect(nodes.find((n) => n.id === 'S1')?.parentId).toBe('C1');
    expect(isDescendant(nodes, 'S1', 'P2')).toBe(true);
    expect(changed.map((n) => n.id)).not.toContain('S1');
  });

  it('moves between parents and re-packs both sibling lists', () => {
    const { nodes } = applyMove(sample(), 'C1', 'P2', 1);
    expect(order(nodes, 'P1')).toEqual(['C2']);
    expect(order(nodes, 'P2')).toEqual(['C3', 'C1']);
    assertTreeInvariants(nodes);
  });

  it('moves a nested section to the book root', () => {
    const { nodes } = applyMove(sample(), 'C2', null, 1);
    expect(order(nodes, null)).toEqual(['V1', 'C2', 'C4', 'C5']);
    expect(order(nodes, 'P1')).toEqual(['C1']);
    assertTreeInvariants(nodes);
  });

  it('keeps ids, titles and other fields untouched and does not mutate the input', () => {
    const input = sample();
    const snapshot = structuredClone(input);
    const { nodes } = applyMove(input, 'C4', 'P1', 0);
    expect(input).toEqual(snapshot);
    expect(nodes.map((n) => n.id).sort()).toEqual(input.map((n) => n.id).sort());
    expect(nodes.find((n) => n.id === 'C4')?.title).toBe('C4');
  });

  it('reports only the rows that changed', () => {
    const { changed } = applyMove(sample(), 'C5', null, 1);
    expect(changed.map((n) => n.id).sort()).toEqual(['C4', 'C5']);
  });

  it('refuses invalid moves and leaves the input intact', () => {
    const input = sample();
    expect(codeOf(() => applyMove(input, 'P1', 'S1', 0))).toBe('INVALID_MOVE');
    expect(input).toEqual(sample());
  });

  it('ignores trashed siblings when packing positions', () => {
    const withTrash = [...sample(), node('C6', 'chapter', 'P1', 2, '2026-01-01T00:00:00.000Z')];
    const { nodes } = applyMove(withTrash, 'C4', 'P1', 2);
    expect(order(nodes, 'P1')).toEqual(['C1', 'C2', 'C4']);
    expect(nodes.find((n) => n.id === 'C6')?.position).toBe(2);
  });
});

describe('missing and trashed targets', () => {
  it('reports NOT_FOUND for unknown or trashed nodes and parents', () => {
    const nodes = trashNode(sample(), 'P2', 'now').nodes;
    expect(codeOf(() => validateMove(nodes, 'nope', null, 0))).toBe('NOT_FOUND');
    expect(codeOf(() => validateMove(nodes, 'C3', null, 0))).toBe('NOT_FOUND');
    expect(codeOf(() => validateMove(nodes, 'C4', 'nope', 0))).toBe('NOT_FOUND');
    expect(codeOf(() => validateMove(nodes, 'C4', 'P2', 0))).toBe('NOT_FOUND');
    expect(codeOf(() => validateMove(nodes, 'C4', 'C3', 0))).toBe('NOT_FOUND');
  });

  it('reports NOT_FOUND for a parent in another book', () => {
    const nodes = [...sample(), { ...node('X1', 'volume', null, 1), bookId: 'b2' }];
    expect(codeOf(() => validateMove(nodes, 'C4', 'X1', 0))).toBe('NOT_FOUND');
  });
});

describe('trash and restore (TREE-08)', () => {
  const NOW = '2026-03-01T00:00:00.000Z';

  it('marks only the subtree root and closes the gap', () => {
    const { nodes } = trashNode(sample(), 'C1', NOW);
    expect(nodes.find((n) => n.id === 'C1')?.deletedAt).toBe(NOW);
    expect(nodes.find((n) => n.id === 'S1')?.deletedAt).toBeNull();
    expect(order(nodes, 'P1')).toEqual(['C2']);
    expect(nodes.find((n) => n.id === 'C2')?.position).toBe(0);
    assertTreeInvariants(nodes);
  });

  it('hides descendants of a trashed section from the live tree', () => {
    const { nodes } = trashNode(sample(), 'P1', NOW);
    const ids = JSON.stringify(buildTree(nodes));
    expect(ids).not.toContain('"id":"C1"');
    expect(ids).not.toContain('"id":"S1"');
    expect(ids).toContain('"id":"P2"');
  });

  it('cannot trash an already trashed section or one under a trashed parent', () => {
    const { nodes } = trashNode(sample(), 'P1', NOW);
    expect(codeOf(() => trashNode(nodes, 'P1', NOW))).toBe('NOT_FOUND');
    expect(codeOf(() => trashNode(nodes, 'C1', NOW))).toBe('NOT_FOUND');
  });

  it('restores to the end of the original parent', () => {
    const trashed = trashNode(sample(), 'C1', NOW).nodes;
    const { nodes } = restoreNode(trashed, 'C1');
    expect(order(nodes, 'P1')).toEqual(['C2', 'C1']);
    expect(nodes.find((n) => n.id === 'C1')?.deletedAt).toBeNull();
    assertTreeInvariants(nodes);
  });

  it('restores a whole subtree with its descendants', () => {
    const trashed = trashNode(sample(), 'P1', NOW).nodes;
    const { nodes } = restoreNode(trashed, 'P1');
    expect(order(nodes, 'V1')).toEqual(['P2', 'P1']);
    expect(JSON.stringify(buildTree(nodes))).toContain('"id":"S1"');
    assertTreeInvariants(nodes);
  });

  it('restores to the root when the original parent is trashed', () => {
    const afterChild = trashNode(sample(), 'C1', NOW).nodes;
    const trashed = trashNode(afterChild, 'P1', NOW).nodes;
    const { nodes } = restoreNode(trashed, 'C1');
    expect(nodes.find((n) => n.id === 'C1')?.parentId).toBeNull();
    expect(order(nodes, null)).toEqual(['V1', 'C4', 'C5', 'C1']);
    assertTreeInvariants(nodes);
  });

  it('keeps individually trashed descendants trashed when the parent is restored', () => {
    const afterChild = trashNode(sample(), 'C1', NOW).nodes;
    const trashed = trashNode(afterChild, 'P1', NOW).nodes;
    const { nodes } = restoreNode(trashed, 'P1');
    expect(nodes.find((n) => n.id === 'C1')?.deletedAt).toBe(NOW);
    expect(order(nodes, 'P1')).toEqual(['C2']);
  });

  it('falls back to the root when the rank rule no longer holds', () => {
    const trashed = trashNode(sample(), 'C4', NOW).nodes;
    const reparented = trashed.map((n) => (n.id === 'C4' ? { ...n, parentId: 'S1' } : n));
    const { nodes } = restoreNode(reparented, 'C4');
    expect(nodes.find((n) => n.id === 'C4')?.parentId).toBeNull();
  });

  it('rejects restoring a live or unknown section', () => {
    expect(codeOf(() => restoreNode(sample(), 'C1'))).toBe('NOT_TRASHED');
    expect(codeOf(() => restoreNode(sample(), 'nope'))).toBe('NOT_FOUND');
  });
});

describe('insertNode', () => {
  it('inserts at the index and re-packs siblings', () => {
    const { nodes, changed } = insertNode(sample(), node('C9', 'chapter', 'P1', 99), 1);
    expect(order(nodes, 'P1')).toEqual(['C1', 'C9', 'C2']);
    expect(changed.map((n) => n.id).sort()).toEqual(['C2', 'C9']);
    assertTreeInvariants(nodes);
  });

  it('enforces the rank rule, parent and index', () => {
    expect(codeOf(() => insertNode(sample(), node('X', 'part', 'P1', 0), 0))).toBe(
      'INVALID_PARENT',
    );
    expect(codeOf(() => insertNode(sample(), node('X', 'chapter', 'nope', 0), 0))).toBe(
      'NOT_FOUND',
    );
    expect(codeOf(() => insertNode(sample(), node('X', 'chapter', 'P1', 0), 3))).toBe(
      'INVALID_INDEX',
    );
  });
});

describe('assertTreeInvariants', () => {
  it('accepts a valid tree, including trashed subtrees', () => {
    assertTreeInvariants(sample());
    assertTreeInvariants(trashNode(sample(), 'P1', 'now').nodes);
    assertTreeInvariants([]);
  });

  it('detects a missing parent', () => {
    const nodes = sample().map((n) => (n.id === 'C4' ? { ...n, parentId: 'ghost' } : n));
    expect(() => assertTreeInvariants(nodes)).toThrow(TreeInvariantError);
  });

  it('detects a parent in another book', () => {
    const nodes = sample().map((n) => (n.id === 'V1' ? { ...n, bookId: 'b2' } : n));
    expect(() => assertTreeInvariants(nodes)).toThrow(/another book/);
  });

  it('detects a cycle', () => {
    const nodes = [node('A', 'volume', 'B', 0), node('B', 'volume', 'A', 0)];
    expect(() => assertTreeInvariants(nodes)).toThrow(/cycle/);
  });

  it('detects a rank violation', () => {
    const nodes = sample().map((n) => (n.id === 'C4' ? { ...n, parentId: 'C5' } : n));
    expect(() => assertTreeInvariants(nodes)).toThrow(/cannot be under/);
  });

  it('detects gaps and duplicate positions among live siblings', () => {
    const gap = sample().map((n) => (n.id === 'C5' ? { ...n, position: 5 } : n));
    expect(() => assertTreeInvariants(gap)).toThrow(/positions/);
    const duplicate = sample().map((n) => (n.id === 'C5' ? { ...n, position: 1 } : n));
    expect(() => assertTreeInvariants(duplicate)).toThrow(/positions/);
  });

  it('ignores positions of trashed siblings', () => {
    const nodes = [...sample(), node('C6', 'chapter', 'P1', 7, 'now')];
    assertTreeInvariants(nodes);
  });
});

describe('react-arborist index adapter', () => {
  const nodes = sample();
  // Root list: V1 (0), C4 (1), C5 (2). P1 list: C1 (0), C2 (1).

  it('keeps the index when moving up within the same parent', () => {
    expect(arboristIndexToFinalIndex(nodes, 'C5', null, 0)).toBe(0);
    expect(arboristIndexToFinalIndex(nodes, 'C5', null, 1)).toBe(1);
  });

  it('subtracts one when moving down within the same parent', () => {
    expect(arboristIndexToFinalIndex(nodes, 'V1', null, 2)).toBe(1);
    expect(arboristIndexToFinalIndex(nodes, 'V1', null, 3)).toBe(2);
    expect(arboristIndexToFinalIndex(nodes, 'C1', 'P1', 2)).toBe(1);
  });

  it('maps dropping directly before or after itself to its current index', () => {
    expect(arboristIndexToFinalIndex(nodes, 'C4', null, 1)).toBe(1);
    expect(arboristIndexToFinalIndex(nodes, 'C4', null, 2)).toBe(1);
  });

  it('keeps the index when the parent changes', () => {
    expect(arboristIndexToFinalIndex(nodes, 'C4', 'P1', 2)).toBe(2);
    expect(arboristIndexToFinalIndex(nodes, 'C1', null, 3)).toBe(3);
    expect(arboristIndexToFinalIndex(nodes, 'C1', null, 0)).toBe(0);
  });

  it('produces moves that applyMove accepts and places where the drop indicator was', () => {
    // Drag C4 below C5: arborist reports index 3 in the root list [V1, C4, C5].
    const index = arboristIndexToFinalIndex(nodes, 'C4', null, 3);
    expect(order(applyMove(nodes, 'C4', null, index).nodes, null)).toEqual(['V1', 'C5', 'C4']);
    // Drag C5 above C4: arborist reports index 1.
    const up = arboristIndexToFinalIndex(nodes, 'C5', null, 1);
    expect(order(applyMove(nodes, 'C5', null, up).nodes, null)).toEqual(['V1', 'C5', 'C4']);
  });
});

describe('keyboardMoveTarget (MOVE-09)', () => {
  const tree = [
    node('p1', 'part', null, 0),
    node('c1', 'chapter', 'p1', 0),
    node('c2', 'chapter', 'p1', 1),
    node('s1', 'scene', 'c2', 0),
    node('p2', 'part', null, 1),
    node('c3', 'chapter', 'p2', 0),
    node('gone', 'chapter', 'p1', 2, '2026-01-01'),
  ];

  it('moves among siblings and stops at the edges', () => {
    expect(keyboardMoveTarget(tree, 'c2', 'up')).toEqual({ parentId: 'p1', index: 0 });
    expect(keyboardMoveTarget(tree, 'c1', 'down')).toEqual({ parentId: 'p1', index: 1 });
    expect(keyboardMoveTarget(tree, 'c1', 'up')).toBeNull();
    expect(keyboardMoveTarget(tree, 'c2', 'down')).toBeNull();
    expect(keyboardMoveTarget(tree, 'p1', 'down')).toEqual({ parentId: null, index: 1 });
  });

  it('applies the returned target as a valid move', () => {
    const target = keyboardMoveTarget(tree, 'c1', 'down');
    const moved = applyMove(tree, 'c1', target!.parentId, target!.index).nodes;
    const order = moved.filter((n) => n.parentId === 'p1' && !n.deletedAt);
    expect(order.sort((a, b) => a.position - b.position).map((n) => n.id)).toEqual(['c2', 'c1']);
  });

  it('refuses to indent when the rank rule or a missing previous sibling forbids it', () => {
    expect(keyboardMoveTarget(tree, 'c2', 'indent')).toBeNull();
    expect(keyboardMoveTarget(tree, 'p2', 'indent')).toBeNull();
    expect(keyboardMoveTarget(tree, 'c1', 'indent')).toBeNull();
    expect(keyboardMoveTarget(tree, 'c3', 'indent')).toBeNull();
  });

  it('indents a section after the previous sibling’s existing children', () => {
    const rootChapter = [
      node('p1', 'part', null, 0),
      node('c1', 'chapter', 'p1', 0),
      node('rc', 'chapter', null, 1),
    ];
    expect(keyboardMoveTarget(rootChapter, 'rc', 'indent')).toEqual({ parentId: 'p1', index: 1 });
  });

  it('outdents to just after the parent, or does nothing at the root', () => {
    expect(keyboardMoveTarget(tree, 's1', 'outdent')).toEqual({ parentId: 'p1', index: 2 });
    expect(keyboardMoveTarget(tree, 'c3', 'outdent')).toEqual({ parentId: null, index: 2 });
    expect(keyboardMoveTarget(tree, 'p1', 'outdent')).toBeNull();
  });

  it('ignores trashed and unknown sections', () => {
    expect(keyboardMoveTarget(tree, 'gone', 'up')).toBeNull();
    expect(keyboardMoveTarget(tree, 'nope', 'down')).toBeNull();
  });
});

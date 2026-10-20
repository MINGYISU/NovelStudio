import { describe, expect, it } from 'vitest';
import {
  applyMove,
  assertTreeInvariants,
  checkMove,
  insertNode,
  restoreNode,
  trashNode,
  type StructuralNode,
} from './tree.ts';
import { NODE_KINDS, NODE_RANK, type NodeKind } from './types.ts';

/** mulberry32: small seeded PRNG so a failing run can be replayed from its seed. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number): number => Math.floor(next() * maxExclusive),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

type Random = ReturnType<typeof createRandom>;

function randomTree(random: Random, size: number): StructuralNode[] {
  let nodes: StructuralNode[] = [];
  for (let i = 0; i < size; i++) {
    const kind: NodeKind = random.pick(NODE_KINDS);
    const candidates = nodes.filter(
      (n) => n.deletedAt === null && NODE_RANK[kind] > NODE_RANK[n.kind],
    );
    const parentId =
      candidates.length === 0 || random.next() < 0.2 ? null : random.pick(candidates).id;
    const siblings = nodes.filter((n) => n.parentId === parentId && n.deletedAt === null);
    const draft: StructuralNode = {
      id: `n${i}`,
      bookId: 'b1',
      parentId,
      kind,
      position: 0,
      deletedAt: null,
    };
    nodes = insertNode(nodes, draft, random.int(siblings.length + 1)).nodes;
  }
  return nodes;
}

function relation(nodes: StructuralNode[]): Map<string, string | null> {
  return new Map(nodes.map((n) => [n.id, n.parentId]));
}

function liveOrder(nodes: StructuralNode[], parentId: string | null): string[] {
  return nodes
    .filter((n) => n.parentId === parentId && n.deletedAt === null)
    .sort((a, b) => a.position - b.position)
    .map((n) => n.id);
}

const MOVES = 1000;

describe.each([1, 2, 3, 20261020])('random moves, seed %i', (seed) => {
  it(`keeps the invariants through ${MOVES} moves`, () => {
    const random = createRandom(seed);
    let nodes = randomTree(random, 60);
    assertTreeInvariants(nodes);
    let applied = 0;
    let refused = 0;

    for (let step = 0; step < MOVES; step++) {
      const picked = random.pick(nodes);
      const nodeId = picked.id;
      // Mostly rank-compatible parents so plenty of moves apply; the rest are arbitrary.
      const compatible = nodes.filter((n) => NODE_RANK[picked.kind] > NODE_RANK[n.kind]);
      const parentId =
        random.next() < 0.7 && compatible.length > 0
          ? random.pick<string | null>([null, ...compatible.map((n) => n.id)])
          : random.pick<string | null>([null, ...nodes.map((n) => n.id), 'ghost']);
      const index = random.int(12) - 1;
      const before = nodes;
      const snapshot = structuredClone(before);
      const check = checkMove(before, nodeId, parentId, index);

      if (check.ok) {
        const moved = applyMove(before, nodeId, parentId, index);
        nodes = moved.nodes;
        assertTreeInvariants(nodes);
        applied++;

        const node = nodes.find((n) => n.id === nodeId);
        expect(node?.parentId).toBe(parentId);
        expect(liveOrder(nodes, parentId).indexOf(nodeId)).toBe(index);
        // Everything but the moved node keeps its parent: descendants follow the node.
        const parents = relation(before);
        for (const n of nodes) {
          if (n.id !== nodeId) expect(n.parentId).toBe(parents.get(n.id));
        }
        // Other siblings keep their relative order.
        const destBefore = liveOrder(before, parentId).filter((id) => id !== nodeId);
        expect(liveOrder(nodes, parentId).filter((id) => id !== nodeId)).toEqual(destBefore);
        expect(nodes.map((n) => n.id)).toEqual(before.map((n) => n.id));
      } else {
        refused++;
        expect(() => applyMove(before, nodeId, parentId, index)).toThrow();
        expect(before).toEqual(snapshot);
      }
    }
    expect(applied).toBeGreaterThan(MOVES / 10);
    expect(refused).toBeGreaterThan(MOVES / 10);
  });

  it('keeps the invariants when moves are mixed with trash and restore', () => {
    const random = createRandom(seed + 1000);
    let nodes = randomTree(random, 40);
    for (let step = 0; step < MOVES; step++) {
      const roll = random.next();
      const nodeId = random.pick(nodes).id;
      const node = nodes.find((n) => n.id === nodeId) as StructuralNode;
      if (roll < 0.1 && node.deletedAt === null) {
        try {
          nodes = trashNode(nodes, nodeId, `t${step}`).nodes;
        } catch {
          // Only live sections can be trashed; descendants of a trashed section are refused.
        }
      } else if (roll < 0.2 && node.deletedAt !== null) {
        nodes = restoreNode(nodes, nodeId).nodes;
      } else {
        const parentId = random.pick<string | null>([null, ...nodes.map((n) => n.id)]);
        const index = random.int(8);
        if (checkMove(nodes, nodeId, parentId, index).ok) {
          nodes = applyMove(nodes, nodeId, parentId, index).nodes;
        }
      }
      assertTreeInvariants(nodes);
    }
  });
});

describe('seeded generator', () => {
  it('is deterministic for a given seed', () => {
    expect(randomTree(createRandom(7), 30)).toEqual(randomTree(createRandom(7), 30));
    expect(randomTree(createRandom(7), 30)).not.toEqual(randomTree(createRandom(8), 30));
  });
});

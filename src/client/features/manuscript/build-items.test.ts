import { describe, expect, it } from 'vitest';
import { DEFAULT_STRUCTURE } from '../../../shared/schemas/structure.ts';
import type { NodeKind, TreeNode } from '../../../shared/types.ts';
import { buildItems, childKindOf, totalWords, trashEntries } from './build-items.ts';

function node(
  id: string,
  kind: NodeKind,
  parentId: string | null,
  position: number,
  extra: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    bookId: 'b',
    parentId,
    kind,
    title: id,
    position,
    numbered: kind !== 'scene',
    status: 'draft',
    synopsis: '',
    wordCount: 10,
    deletedAt: null,
    ...extra,
  };
}

const nodes = [
  node('p1', 'part', null, 0),
  node('c1', 'chapter', 'p1', 0),
  node('c2', 'chapter', 'p1', 1),
  node('s1', 'scene', 'c2', 0),
  node('gone', 'chapter', null, 1, { deletedAt: '2026-01-01', wordCount: 99 }),
];

describe('buildItems', () => {
  it('nests live sections with computed display titles and leaves trash out', () => {
    const items = buildItems(nodes, DEFAULT_STRUCTURE);
    expect(items).toHaveLength(1);
    expect(items[0]?.displayTitle).toBe('Part 1 — p1');
    expect(items[0]?.children?.map((c) => c.displayTitle)).toEqual([
      'Chapter 1 — c1',
      'Chapter 2 — c2',
    ]);
  });

  it('gives scenes no children array so the tree treats them as leaves', () => {
    const chapter = buildItems(nodes, DEFAULT_STRUCTURE)[0]?.children?.[1];
    expect(chapter?.children?.[0]?.children).toBeNull();
    expect(buildItems(nodes, DEFAULT_STRUCTURE)[0]?.children?.[0]?.children).toEqual([]);
  });
});

describe('childKindOf and totalWords', () => {
  it('picks the next kind down and none for scenes', () => {
    expect(childKindOf('volume')).toBe('part');
    expect(childKindOf('part')).toBe('chapter');
    expect(childKindOf('chapter')).toBe('scene');
    expect(childKindOf('scene')).toBeNull();
  });

  it('sums live sections only', () => {
    expect(totalWords(nodes)).toBe(40);
  });
});

describe('trashEntries (TREE-08)', () => {
  it('lists trashed sections newest first with what comes back when each is restored', () => {
    const list = trashEntries([
      node('p1', 'part', null, 0),
      node('c1', 'chapter', 'p1', 0, { deletedAt: '2026-01-01T10:00:00.000Z', wordCount: 100 }),
      node('s1', 'scene', 'c1', 0, { wordCount: 5 }),
      node('s2', 'scene', 'c1', 1, { wordCount: 7, deletedAt: '2026-01-01T09:00:00.000Z' }),
      node('s3', 'scene', 'c1', 2, { wordCount: 3 }),
      node('c2', 'chapter', null, 1, { deletedAt: '2026-01-02T10:00:00.000Z', wordCount: 0 }),
    ]);
    expect(list.map((e) => [e.node.id, e.sections, e.words])).toEqual([
      ['c2', 1, 0],
      ['c1', 3, 108],
      ['s2', 1, 7],
    ]);
  });

  it('is empty when nothing is trashed', () => {
    expect(trashEntries([node('p1', 'part', null, 0), node('c1', 'chapter', 'p1', 0)])).toEqual([]);
  });
});

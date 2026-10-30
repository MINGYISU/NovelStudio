import { describe, expect, it } from 'vitest';
import {
  analyzeForeshadows,
  computeReadingOrder,
  newWarnings,
  warningsByNode,
  type ForeshadowWarning,
  type WarningKind,
} from './foreshadow.ts';
import type { OccurrenceRole, Thread } from './schemas/foreshadow.ts';
import { applyMove } from './tree.ts';
import type { NodeKind, TreeNode } from './types.ts';

function node(
  id: string,
  position: number,
  extra: Partial<TreeNode> = {},
  kind: NodeKind = 'chapter',
): TreeNode {
  return {
    id,
    bookId: 'b1',
    parentId: null,
    kind,
    title: id,
    position,
    numbered: true,
    status: 'draft',
    synopsis: '',
    wordCount: 0,
    deletedAt: null,
    ...extra,
  };
}

/** `n` numbered chapters c1..cN at the root. */
const chapters = (n: number): TreeNode[] =>
  Array.from({ length: n }, (_, i) => node(`c${i + 1}`, i));

function thread(
  occurrences: [OccurrenceRole, string | null][],
  extra: Partial<Thread> = {},
): Thread {
  const id = extra.id ?? 't1';
  return {
    id,
    bookId: 'b1',
    title: 'Compass',
    description: '',
    status: 'planted',
    color: '#c0841a',
    notes: '',
    createdAt: 'x',
    updatedAt: 'x',
    ...extra,
    occurrences: occurrences.map(([role, nodeId], i) => ({
      id: `${id}-o${i}`,
      foreshadowId: id,
      nodeId,
      role,
      excerpt: '',
      note: '',
      anchored: false,
      anchorState: null,
      createdAt: 'x',
    })),
  };
}

const kinds = (warnings: ForeshadowWarning[]): WarningKind[] => warnings.map((w) => w.kind);

describe('computeReadingOrder', () => {
  it('walks live sections depth-first and counts numbered chapters', () => {
    const nodes: TreeNode[] = [
      node('v1', 0, {}, 'volume'),
      node('intro', 0, { parentId: 'v1', numbered: false }),
      node('c1', 1, { parentId: 'v1' }),
      node('s1', 0, { parentId: 'c1' }, 'scene'),
      node('c2', 2, { parentId: 'v1' }),
      node('trashed', 3, { parentId: 'v1', deletedAt: 'x' }),
      node('c3', 1),
    ];
    const { ordered, positions } = computeReadingOrder(nodes);
    expect(ordered.map((n) => n.id)).toEqual(['v1', 'intro', 'c1', 's1', 'c2', 'c3']);
    expect(positions.get('v1')).toEqual({ order: 0, chapterIndex: 0 });
    expect(positions.get('intro')).toEqual({ order: 1, chapterIndex: 0 });
    expect(positions.get('c1')).toEqual({ order: 2, chapterIndex: 1 });
    expect(positions.get('s1')).toEqual({ order: 3, chapterIndex: 1 });
    expect(positions.get('c3')).toEqual({ order: 5, chapterIndex: 3 });
    expect(positions.has('trashed')).toBe(false);
  });
});

describe('analyzeForeshadows (FS-05)', () => {
  it('reports nothing for a healthy thread', () => {
    const t = thread([
      ['setup', 'c1'],
      ['hint', 'c2'],
      ['payoff', 'c3'],
    ]);
    expect(analyzeForeshadows(chapters(3), [t])).toEqual([]);
  });

  it('PAYOFF_BEFORE_SETUP: a payoff earlier in reading order than the first setup', () => {
    const t = thread([
      ['setup', 'c2'],
      ['payoff', 'c1'],
    ]);
    const [warning, ...rest] = analyzeForeshadows(chapters(3), [t]);
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({
      id: 't1:PAYOFF_BEFORE_SETUP',
      kind: 'PAYOFF_BEFORE_SETUP',
      level: 'warning',
      threadId: 't1',
    });
    expect(warning!.nodeIds.sort()).toEqual(['c1', 'c2']);
  });

  it('carries a readable message naming the thread', () => {
    const t = thread([['payoff', 'c1']], { title: 'The red door' });
    expect(analyzeForeshadows(chapters(1), [t])[0]!.message).toBe(
      '“The red door”: it has a payoff but no setup.',
    );
  });

  it('carries the thread title so the client can translate the message (I18N-07)', () => {
    const t = thread([['payoff', 'c1']], { title: 'The red door' });
    expect(analyzeForeshadows(chapters(1), [t])[0]).toMatchObject({
      kind: 'PAYOFF_WITHOUT_SETUP',
      threadTitle: 'The red door',
    });
  });

  it('PAYOFF_BEFORE_SETUP ignores a payoff after the first setup, and only marks the early ones', () => {
    const t = thread([
      ['setup', 'c2'],
      ['payoff', 'c1'],
      ['payoff', 'c3'],
      ['setup', 'c4'],
    ]);
    const [warning] = analyzeForeshadows(chapters(4), [t]);
    expect(warning!.nodeIds.sort()).toEqual(['c1', 'c2']);
  });

  it('is not triggered when the payoff and the first setup are in the same section', () => {
    const t = thread([
      ['setup', 'c1'],
      ['payoff', 'c1'],
    ]);
    expect(analyzeForeshadows(chapters(2), [t])).toEqual([]);
  });

  it('PAYOFF_WITHOUT_SETUP', () => {
    const t = thread([
      ['hint', 'c1'],
      ['payoff', 'c2'],
    ]);
    const warnings = analyzeForeshadows(chapters(2), [t]);
    expect(kinds(warnings)).toEqual(['PAYOFF_WITHOUT_SETUP']);
    expect(warnings[0]!.nodeIds).toEqual(['c2']);
  });

  it('SETUP_WITHOUT_PAYOFF is info level and skipped for abandoned threads', () => {
    const occ: [OccurrenceRole, string][] = [['setup', 'c1']];
    const warnings = analyzeForeshadows(chapters(2), [thread(occ)]);
    expect(warnings).toMatchObject([{ kind: 'SETUP_WITHOUT_PAYOFF', level: 'info' }]);
    expect(analyzeForeshadows(chapters(2), [thread(occ, { status: 'abandoned' })])).toEqual([]);
    expect(kinds(analyzeForeshadows(chapters(2), [thread(occ, { status: 'paid_off' })]))).toEqual([
      'SETUP_WITHOUT_PAYOFF',
    ]);
  });

  it('a hint alone raises nothing', () => {
    expect(analyzeForeshadows(chapters(2), [thread([['hint', 'c1']])])).toEqual([]);
  });

  describe('DORMANT', () => {
    const occ = (to: string): [OccurrenceRole, string][] => [
      ['setup', 'c1'],
      ['payoff', to],
    ];

    it('fires only when the gap is greater than the threshold (default 10)', () => {
      expect(analyzeForeshadows(chapters(11), [thread(occ('c11'))])).toEqual([]);
      const warnings = analyzeForeshadows(chapters(12), [thread(occ('c12'))]);
      expect(warnings).toMatchObject([{ kind: 'DORMANT', level: 'warning' }]);
      expect(warnings[0]!.nodeIds.sort()).toEqual(['c1', 'c12']);
    });

    it('honors a configured threshold', () => {
      expect(
        kinds(analyzeForeshadows(chapters(5), [thread(occ('c5'))], { dormantAfter: 3 })),
      ).toEqual(['DORMANT']);
      expect(analyzeForeshadows(chapters(5), [thread(occ('c5'))], { dormantAfter: 4 })).toEqual([]);
    });

    it('measures gaps in numbered chapters: scenes count as their chapter, unnumbered sections do not count', () => {
      const nodes: TreeNode[] = [
        node('c1', 0),
        node('s1', 0, { parentId: 'c1' }, 'scene'),
        node('extra1', 1, { numbered: false }),
        node('extra2', 2, { numbered: false }),
        node('c2', 3),
        node('c3', 4),
        node('s3', 0, { parentId: 'c3' }, 'scene'),
      ];
      const t = thread([
        ['setup', 's1'],
        ['payoff', 's3'],
      ]);
      // s1 is in chapter 1 and s3 in chapter 3: gap of 2.
      expect(analyzeForeshadows(nodes, [t], { dormantAfter: 2 })).toEqual([]);
      expect(kinds(analyzeForeshadows(nodes, [t], { dormantAfter: 1 }))).toEqual(['DORMANT']);
    });

    it('checks consecutive occurrences, so a hint in the middle prevents it', () => {
      const t = thread([
        ['setup', 'c1'],
        ['hint', 'c8'],
        ['payoff', 'c15'],
      ]);
      expect(analyzeForeshadows(chapters(15), [t], { dormantAfter: 10 })).toEqual([]);
      expect(kinds(analyzeForeshadows(chapters(15), [t], { dormantAfter: 6 }))).toEqual([
        'DORMANT',
      ]);
    });
  });

  describe('ORPHANED', () => {
    it('flags an occurrence in a trashed section and keeps analysing the live ones', () => {
      const nodes = [...chapters(2), node('c3', 2, { deletedAt: 'x' })];
      const t = thread([
        ['setup', 'c1'],
        ['payoff', 'c3'],
      ]);
      const warnings = analyzeForeshadows(nodes, [t]);
      expect(kinds(warnings).sort()).toEqual(['ORPHANED', 'SETUP_WITHOUT_PAYOFF']);
      const orphaned = warnings.find((w) => w.kind === 'ORPHANED')!;
      expect(orphaned.occurrenceIds).toEqual(['t1-o1']);
      expect(orphaned.nodeIds).toEqual(['c3']);
    });

    it('flags an occurrence whose section is under a trashed parent', () => {
      const nodes = [node('p1', 0, { deletedAt: 'x' }, 'part'), node('c1', 0, { parentId: 'p1' })];
      expect(kinds(analyzeForeshadows(nodes, [thread([['hint', 'c1']])]))).toEqual(['ORPHANED']);
    });

    it('flags a missing section and a purged one (null node id)', () => {
      const t = thread([
        ['hint', 'gone'],
        ['hint', null],
      ]);
      const [warning] = analyzeForeshadows(chapters(1), [t]);
      expect(warning).toMatchObject({ kind: 'ORPHANED', occurrenceIds: ['t1-o0', 't1-o1'] });
      expect(warning!.nodeIds).toEqual(['gone']);
    });

    it('restoring the section clears the warning', () => {
      const t = thread([
        ['setup', 'c1'],
        ['payoff', 'c2'],
      ]);
      const trashed = [node('c1', 0), node('c2', 1, { deletedAt: 'x' })];
      expect(kinds(analyzeForeshadows(trashed, [t]))).toContain('ORPHANED');
      expect(analyzeForeshadows([node('c1', 0), node('c2', 1)], [t])).toEqual([]);
    });
  });

  it('analyses every thread on its own', () => {
    const good = thread(
      [
        ['setup', 'c1'],
        ['payoff', 'c2'],
      ],
      { id: 'good' },
    );
    const bad = thread([['payoff', 'c1']], { id: 'bad' });
    const warnings = analyzeForeshadows(chapters(2), [good, bad]);
    expect(warnings.map((w) => w.id)).toEqual(['bad:PAYOFF_WITHOUT_SETUP']);
  });

  it('does not depend on the order the occurrences were created in', () => {
    const forward = thread([
      ['setup', 'c1'],
      ['payoff', 'c3'],
    ]);
    const reversed = thread([
      ['payoff', 'c3'],
      ['setup', 'c1'],
    ]);
    expect(analyzeForeshadows(chapters(3), [forward])).toEqual([]);
    expect(analyzeForeshadows(chapters(3), [reversed])).toEqual([]);
  });
});

describe('moving the payoff chapter (M7 done-when)', () => {
  const t = thread([
    ['setup', 'c2'],
    ['payoff', 'c8'],
  ]);

  it('dragging the payoff above the setup shows PAYOFF_BEFORE_SETUP; moving it back clears it', () => {
    const start = chapters(8);
    expect(analyzeForeshadows(start, [t])).toEqual([]);

    const above = applyMove(start, 'c8', null, 0).nodes;
    const broken = analyzeForeshadows(above, [t]);
    expect(kinds(broken)).toEqual(['PAYOFF_BEFORE_SETUP']);

    const back = applyMove(above, 'c8', null, 7).nodes;
    expect(analyzeForeshadows(back, [t])).toEqual([]);
  });

  it('moving the setup after the payoff breaks it the same way', () => {
    const moved = applyMove(chapters(8), 'c2', null, 7).nodes;
    expect(kinds(analyzeForeshadows(moved, [t]))).toEqual(['PAYOFF_BEFORE_SETUP']);
  });

  it('moving a chapter between parents changes reading order too', () => {
    const nodes: TreeNode[] = [
      node('p1', 0, {}, 'part'),
      node('p2', 1, {}, 'part'),
      node('c2', 0, { parentId: 'p1' }),
      node('c8', 0, { parentId: 'p2' }),
    ];
    expect(analyzeForeshadows(nodes, [t])).toEqual([]);
    const moved = applyMove(nodes, 'c8', 'p1', 0).nodes;
    expect(kinds(analyzeForeshadows(moved, [t]))).toEqual(['PAYOFF_BEFORE_SETUP']);
  });
});

describe('newWarnings (FS-06 toast)', () => {
  const warning = (
    threadId: string,
    kind: WarningKind,
    nodeIds: string[] = [],
  ): ForeshadowWarning => ({
    id: `${threadId}:${kind}`,
    threadId,
    kind,
    level: 'warning',
    threadTitle: '',
    message: '',
    nodeIds,
    occurrenceIds: [],
  });

  it('returns only warnings that were not there before', () => {
    const before = [warning('a', 'ORPHANED'), warning('b', 'DORMANT')];
    const after = [warning('a', 'ORPHANED'), warning('b', 'PAYOFF_BEFORE_SETUP')];
    expect(newWarnings(before, after)).toEqual([warning('b', 'PAYOFF_BEFORE_SETUP')]);
  });

  it('is empty when warnings only disappear or stay', () => {
    const before = [warning('a', 'ORPHANED')];
    expect(newWarnings(before, [])).toEqual([]);
    expect(newWarnings(before, before)).toEqual([]);
  });

  it('does not repeat a warning whose sections changed', () => {
    expect(
      newWarnings([warning('a', 'DORMANT', ['c1'])], [warning('a', 'DORMANT', ['c1', 'c9'])]),
    ).toEqual([]);
  });

  it('reports every warning when there was nothing before', () => {
    expect(newWarnings([], [warning('a', 'ORPHANED')])).toHaveLength(1);
  });
});

describe('warningsByNode (sidebar badges)', () => {
  it('groups warnings by the sections they mark', () => {
    const a: ForeshadowWarning = {
      id: 'a:DORMANT',
      threadId: 'a',
      kind: 'DORMANT',
      level: 'warning',
      threadTitle: '',
      message: '',
      nodeIds: ['c1', 'c2'],
      occurrenceIds: [],
    };
    const b: ForeshadowWarning = { ...a, id: 'b:DORMANT', threadId: 'b', nodeIds: ['c2'] };
    const map = warningsByNode([a, b]);
    expect(map.get('c1')).toEqual([a]);
    expect(map.get('c2')).toEqual([a, b]);
    expect(map.has('c3')).toBe(false);
  });
});

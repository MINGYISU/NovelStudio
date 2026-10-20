import { describe, expect, it } from 'vitest';
import {
  computeDisplayTitles,
  formatLabel,
  formatNumber,
  toAlpha,
  toChineseNumber,
  toRoman,
  type NumberableNode,
} from './numbering.ts';
import {
  DEFAULT_STRUCTURE,
  structureSettingsSchema,
  type StructureSettings,
} from './schemas/structure.ts';
import { applyMove, trashNode } from './tree.ts';
import type { NodeKind } from './types.ts';

function node(
  id: string,
  kind: NodeKind,
  parentId: string | null,
  position: number,
  extra: Partial<NumberableNode> = {},
): NumberableNode {
  return {
    id,
    bookId: 'b1',
    parentId,
    kind,
    position,
    deletedAt: null,
    title: '',
    numbered: kind !== 'scene',
    ...extra,
  };
}

function titles(nodes: NumberableNode[], structure?: StructureSettings): Record<string, string> {
  return Object.fromEntries(computeDisplayTitles(nodes, structure));
}

describe('{n:cn} (NUM-02)', () => {
  const table: [number, string][] = [
    [1, '一'],
    [2, '二'],
    [9, '九'],
    [10, '十'],
    [11, '十一'],
    [19, '十九'],
    [20, '二十'],
    [21, '二十一'],
    [99, '九十九'],
    [100, '一百'],
    [101, '一百零一'],
    [110, '一百一十'],
    [111, '一百一十一'],
    [120, '一百二十'],
    [200, '二百'],
    [999, '九百九十九'],
    [1000, '一千'],
    [1001, '一千零一'],
    [1010, '一千零一十'],
    [1100, '一千一百'],
    [1101, '一千一百零一'],
    [2024, '二千零二十四'],
    [9999, '九千九百九十九'],
    [10000, '一万'],
    [10001, '一万零一'],
    [10010, '一万零一十'],
    [10100, '一万零一百'],
    [11000, '一万一千'],
    [12345, '一万二千三百四十五'],
    [100000, '十万'],
    [110000, '十一万'],
    [100001, '十万零一'],
    [1000000, '一百万'],
    [100000000, '一亿'],
    [100000001, '一亿零一'],
    [100010000, '一亿零一万'],
    [110000000, '一亿一千万'],
  ];

  it.each(table)('%i → %s', (n, expected) => {
    expect(toChineseNumber(n)).toBe(expected);
  });

  it('falls back to digits outside the supported range', () => {
    expect(toChineseNumber(1e12)).toBe('1000000000000');
    expect(toChineseNumber(-1)).toBe('-1');
  });

  it('formats through the token', () => {
    expect(formatLabel('第{n:cn}章', 11)).toBe('第十一章');
  });
});

describe('other number formats (NUM-02)', () => {
  it.each([
    [1, 'I'],
    [4, 'IV'],
    [9, 'IX'],
    [14, 'XIV'],
    [40, 'XL'],
    [90, 'XC'],
    [400, 'CD'],
    [1994, 'MCMXCIV'],
    [3999, 'MMMCMXCIX'],
  ])('roman %i → %s', (n, expected) => {
    expect(toRoman(n)).toBe(expected);
    expect(formatNumber(n, 'roman')).toBe(expected);
    expect(formatNumber(n, 'roman-lower')).toBe(expected.toLowerCase());
  });

  it.each([
    [1, 'A'],
    [2, 'B'],
    [26, 'Z'],
    [27, 'AA'],
    [28, 'AB'],
    [52, 'AZ'],
    [53, 'BA'],
    [702, 'ZZ'],
    [703, 'AAA'],
  ])('alpha %i → %s', (n, expected) => {
    expect(toAlpha(n)).toBe(expected);
  });

  it('replaces every token and keeps other text', () => {
    expect(formatLabel('Chapter {n}', 3)).toBe('Chapter 3');
    expect(formatLabel('Volume {n:roman}', 4)).toBe('Volume IV');
    expect(formatLabel('Book {n:roman-lower}', 4)).toBe('Book iv');
    expect(formatLabel('Act {n:alpha}', 2)).toBe('Act B');
    expect(formatLabel('{n}/{n:roman}', 2)).toBe('2/II');
    expect(formatLabel('Prologue', 2)).toBe('Prologue');
    expect(formatLabel('{n:unknown}', 2)).toBe('{n:unknown}');
  });
});

describe('computeDisplayTitles (§7.2, NUM-03)', () => {
  it('numbers chapters continuously through the book by default', () => {
    const nodes = [
      node('V1', 'volume', null, 0, { title: 'Dawn' }),
      node('P1', 'part', 'V1', 0),
      node('C1', 'chapter', 'P1', 0, { title: 'Arrival' }),
      node('C2', 'chapter', 'P1', 1),
      node('V2', 'volume', null, 1),
      node('C3', 'chapter', 'V2', 0, { title: 'Return' }),
    ];
    expect(titles(nodes)).toEqual({
      V1: 'Volume I — Dawn',
      P1: 'Part 1',
      C1: 'Chapter 1 — Arrival',
      C2: 'Chapter 2',
      V2: 'Volume II',
      C3: 'Chapter 3 — Return',
    });
  });

  it('uses the separator from the settings', () => {
    const structure: StructureSettings = {
      ...DEFAULT_STRUCTURE,
      chapter: { ...DEFAULT_STRUCTURE.chapter, format: '第{n:cn}章', separator: ' ' },
    };
    const nodes = [
      node('C1', 'chapter', null, 0, { title: '重逢' }),
      node('C2', 'chapter', null, 1),
    ];
    expect(titles(nodes, structure)).toEqual({ C1: '第一章 重逢', C2: '第二章' });
  });

  it('shows only the title for unnumbered sections and never consumes a number', () => {
    const nodes = [
      node('PRO', 'chapter', null, 0, { title: 'Prologue', numbered: false }),
      node('C1', 'chapter', null, 1, { title: 'One' }),
      node('INT', 'chapter', null, 2, { title: 'Interlude', numbered: false }),
      node('C2', 'chapter', null, 3, { title: 'Two' }),
      node('BLANK', 'chapter', null, 4, { numbered: false }),
    ];
    expect(titles(nodes)).toEqual({
      PRO: 'Prologue',
      C1: 'Chapter 1 — One',
      INT: 'Interlude',
      C2: 'Chapter 2 — Two',
      BLANK: '(untitled)',
    });
  });

  it('skips trashed sections and their whole subtree', () => {
    const nodes = [
      node('C1', 'chapter', null, 0),
      node('C2', 'chapter', null, 1, { deletedAt: 'now' }),
      node('S2', 'scene', 'C2', 0, { numbered: true }),
      node('C3', 'chapter', null, 2),
    ];
    expect(titles(nodes)).toEqual({ C1: 'Chapter 1', C3: 'Chapter 2' });
  });

  it('restarts scenes within each chapter by default', () => {
    const nodes = [
      node('C1', 'chapter', null, 0),
      node('S1', 'scene', 'C1', 0, { numbered: true }),
      node('S2', 'scene', 'C1', 1, { numbered: true }),
      node('C2', 'chapter', null, 1),
      node('S3', 'scene', 'C2', 0, { numbered: true }),
    ];
    expect(titles(nodes)).toMatchObject({ S1: 'Scene 1', S2: 'Scene 2', S3: 'Scene 1' });
  });

  it('restarts chapters within a part when configured', () => {
    const structure: StructureSettings = {
      ...DEFAULT_STRUCTURE,
      chapter: { ...DEFAULT_STRUCTURE.chapter, restartWithin: 'part' },
    };
    const nodes = [
      node('P1', 'part', null, 0),
      node('C1', 'chapter', 'P1', 0),
      node('C2', 'chapter', 'P1', 1),
      node('P2', 'part', null, 1),
      node('C3', 'chapter', 'P2', 0),
      node('C4', 'chapter', null, 2),
      node('C5', 'chapter', null, 3),
    ];
    expect(titles(nodes, structure)).toMatchObject({
      C1: 'Chapter 1',
      C2: 'Chapter 2',
      C3: 'Chapter 1',
      // Chapters with no part ancestor share the book-level scope.
      C4: 'Chapter 1',
      C5: 'Chapter 2',
    });
  });

  it('uses the nearest matching ancestor as the restart scope', () => {
    const structure: StructureSettings = {
      ...DEFAULT_STRUCTURE,
      part: { ...DEFAULT_STRUCTURE.part, restartWithin: 'volume' },
      chapter: { ...DEFAULT_STRUCTURE.chapter, restartWithin: 'volume' },
    };
    const nodes = [
      node('V1', 'volume', null, 0),
      node('P1', 'part', 'V1', 0),
      node('C1', 'chapter', 'P1', 0),
      node('V2', 'volume', null, 1),
      node('P2', 'part', 'V2', 0),
      node('C2', 'chapter', 'P2', 0),
      node('C3', 'chapter', 'V2', 1),
    ];
    expect(titles(nodes, structure)).toMatchObject({
      P1: 'Part 1',
      P2: 'Part 1',
      C1: 'Chapter 1',
      C2: 'Chapter 1',
      C3: 'Chapter 2',
    });
  });

  it('counts inside a scope that is itself unnumbered', () => {
    const structure: StructureSettings = {
      ...DEFAULT_STRUCTURE,
      scene: { ...DEFAULT_STRUCTURE.scene, restartWithin: 'part' },
    };
    const nodes = [
      node('P1', 'part', null, 0, { numbered: false, title: 'Interlude' }),
      node('S1', 'scene', 'P1', 0, { numbered: true }),
    ];
    expect(titles(nodes, structure)).toEqual({ P1: 'Interlude', S1: 'Scene 1' });
  });

  it('is independent of the order of the input array', () => {
    const nodes = [
      node('C2', 'chapter', null, 1),
      node('C1', 'chapter', null, 0),
      node('C3', 'chapter', null, 2),
    ];
    expect(titles(nodes)).toEqual({ C1: 'Chapter 1', C2: 'Chapter 2', C3: 'Chapter 3' });
  });

  it('swaps labels when Chapter 4 is dragged above Chapter 3 (MOVE-06)', () => {
    const chapters = ['C1', 'C2', 'C3', 'C4', 'C5'].map((id, i) =>
      node(id, 'chapter', null, i, { title: id }),
    );
    const before = titles(chapters);
    expect(before.C3).toBe('Chapter 3 — C3');
    expect(before.C4).toBe('Chapter 4 — C4');
    const after = titles(applyMove(chapters, 'C4', null, 2).nodes);
    expect(after.C4).toBe('Chapter 3 — C4');
    expect(after.C3).toBe('Chapter 4 — C3');
    expect(after.C5).toBe('Chapter 5 — C5');
  });

  it('renumbers after trashing a chapter', () => {
    const chapters = ['C1', 'C2', 'C3'].map((id, i) => node(id, 'chapter', null, i));
    expect(titles(trashNode(chapters, 'C1', 'now').nodes)).toEqual({
      C2: 'Chapter 1',
      C3: 'Chapter 2',
    });
  });
});

describe('structure settings schema (NUM-01)', () => {
  it('accepts the defaults', () => {
    expect(structureSettingsSchema.safeParse(DEFAULT_STRUCTURE).success).toBe(true);
  });

  it('rejects a restart scope that is not a higher kind', () => {
    const bad = {
      ...DEFAULT_STRUCTURE,
      part: { ...DEFAULT_STRUCTURE.part, restartWithin: 'chapter' },
    };
    expect(structureSettingsSchema.safeParse(bad).success).toBe(false);
    const self = {
      ...DEFAULT_STRUCTURE,
      chapter: { ...DEFAULT_STRUCTURE.chapter, restartWithin: 'chapter' },
    };
    expect(structureSettingsSchema.safeParse(self).success).toBe(false);
  });

  it('defaults scenes to unnumbered and restarting within a chapter', () => {
    expect(DEFAULT_STRUCTURE.scene.defaultNumbered).toBe(false);
    expect(DEFAULT_STRUCTURE.scene.restartWithin).toBe('chapter');
    expect(DEFAULT_STRUCTURE.chapter.restartWithin).toBe('book');
  });
});

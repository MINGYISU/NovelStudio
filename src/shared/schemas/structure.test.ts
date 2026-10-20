import { describe, expect, it } from 'vitest';
import { computeDisplayTitles, type NumberableNode } from '../numbering.ts';
import { STRUCTURE_PRESETS, structureSettingsSchema } from './structure.ts';

function chapter(id: string, position: number, title = ''): NumberableNode {
  return {
    id,
    bookId: 'b',
    parentId: null,
    kind: 'chapter',
    position,
    deletedAt: null,
    numbered: true,
    title,
  };
}

describe('structure presets (NUM-04)', () => {
  it('both presets pass the structure schema', () => {
    for (const preset of Object.values(STRUCTURE_PRESETS)) {
      expect(structureSettingsSchema.safeParse(preset).success).toBe(true);
    }
  });

  it('English numbers chapters as "Chapter N — Title"', () => {
    const titles = computeDisplayTitles(
      [chapter('a', 0, 'Start'), chapter('b', 1)],
      STRUCTURE_PRESETS.english,
    );
    expect([...titles.values()]).toEqual(['Chapter 1 — Start', 'Chapter 2']);
  });

  it('Chinese numbers chapters as 第N章 and leaves scenes unnumbered by default', () => {
    const chapters = Array.from({ length: 11 }, (_, i) =>
      chapter(`c${i}`, i, i === 0 ? '开端' : ''),
    );
    const titles = [...computeDisplayTitles(chapters, STRUCTURE_PRESETS.chinese).values()];
    expect(titles[0]).toBe('第一章 开端');
    expect(titles[10]).toBe('第十一章');
    expect(STRUCTURE_PRESETS.chinese.scene.defaultNumbered).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { coverColors } from './cover-color.ts';

describe('coverColors', () => {
  it('is deterministic per ID and differs between IDs', () => {
    const a = coverColors('3f2b9d1e-0000-4000-8000-000000000001');
    expect(coverColors('3f2b9d1e-0000-4000-8000-000000000001')).toEqual(a);
    expect(coverColors('3f2b9d1e-0000-4000-8000-000000000002')).not.toEqual(a);
  });

  it('returns valid CSS colours with a light foreground', () => {
    for (const id of ['', 'a', crypto.randomUUID(), '重逢']) {
      const { background, foreground } = coverColors(id);
      expect(background).toMatch(/^hsl\(\d{1,3} 32% 36%\)$/);
      expect(Number(/hsl\((\d+)/.exec(background)?.[1])).toBeLessThan(360);
      expect(foreground).toBe('#faf8f4');
    }
  });
});

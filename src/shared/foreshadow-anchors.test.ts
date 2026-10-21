import { describe, expect, it } from 'vitest';
import { extractAnchorIds, remapAnchorIds, stripAnchors } from './foreshadow-anchors.ts';
import type { ContentDoc } from './schemas/content.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const anchor = (occurrenceId: string) => ({
  type: 'foreshadowAnchor' as const,
  attrs: { occurrenceId },
});

const doc: ContentDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'plain' },
        { type: 'text', text: 'one', marks: [{ type: 'bold' }, anchor(A)] },
        { type: 'text', text: 'two', marks: [anchor(A)] },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'three', marks: [anchor(B), anchor(C)] }],
        },
      ],
    },
  ],
};

describe('extractAnchorIds', () => {
  it('finds every anchored id once, in nested blocks and with other marks', () => {
    expect([...extractAnchorIds(doc)].sort()).toEqual([A, B, C]);
  });

  it('finds nothing in text without anchors', () => {
    expect(extractAnchorIds({ type: 'doc', content: [] }).size).toBe(0);
    expect(
      extractAnchorIds({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] },
        ],
      }).size,
    ).toBe(0);
  });
});

describe('remapAnchorIds', () => {
  it('rewrites known ids, keeps unknown ones and leaves other marks and the input alone', () => {
    const before = JSON.stringify(doc);
    const out = remapAnchorIds(doc, (id) => (id === A ? 'new-a' : id === B ? 'new-b' : undefined));
    expect([...extractAnchorIds(out)].sort()).toEqual([C, 'new-a', 'new-b']);
    expect(out.content?.[0]?.content?.[1]?.marks?.[0]).toEqual({ type: 'bold' });
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('stripAnchors', () => {
  it('removes anchors only: text, other marks and unmarked text stay', () => {
    const out = stripAnchors(doc);
    expect(extractAnchorIds(out).size).toBe(0);
    expect(out.content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'one',
      marks: [{ type: 'bold' }],
    });
    expect(out.content?.[0]?.content?.[2]).toEqual({ type: 'text', text: 'two' });
    expect(out.content?.[1]?.content?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'three' });
  });
});

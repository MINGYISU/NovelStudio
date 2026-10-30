import { describe, expect, it } from 'vitest';
import { normalizeContent } from './content-normalize.ts';
import { docToPlainText } from './prosemirror-text.ts';
import { contentSchema, type ContentDoc, type ContentNode } from './schemas/content.ts';

const para = (text: string, marks?: ContentNode['marks']): ContentNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

/** `levels` quotes inside each other, each with a paragraph before and after the inner one. */
function nested(levels: number): ContentNode {
  let node: ContentNode = { type: 'blockquote', content: [para(`level ${levels}`)] };
  for (let level = levels - 1; level >= 1; level--) {
    node = {
      type: 'blockquote',
      content: [para(`before ${level}`, [{ type: 'bold' }]), node, para(`after ${level}`)],
    };
  }
  return node;
}

function maxQuoteDepth(node: ContentNode, depth = 0): number {
  const here = node.type === 'blockquote' ? depth + 1 : depth;
  return Math.max(here, ...(node.content ?? []).map((c) => maxQuoteDepth(c, here)));
}

describe('normalizeContent', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('flattens %i nested quotes and keeps the text', (levels) => {
    const doc: ContentDoc = { type: 'doc', content: [para('Intro'), nested(levels), para('End')] };
    const result = normalizeContent(doc);
    expect(docToPlainText(result)).toBe(docToPlainText(doc));
    expect(maxQuoteDepth(result)).toBe(1);
    expect(contentSchema.safeParse(result).success).toBe(true);
  });

  it('splices children in place and keeps marks and order', () => {
    const doc: ContentDoc = { type: 'doc', content: [nested(3)] };
    expect(normalizeContent(doc)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            para('before 1', [{ type: 'bold' }]),
            para('before 2', [{ type: 'bold' }]),
            para('level 3'),
            para('after 2'),
            para('after 1'),
          ],
        },
      ],
    });
  });

  it('makes a 6-level document that the schema refuses valid', () => {
    const doc = { type: 'doc', content: [nested(6)] };
    expect(contentSchema.safeParse(doc).success).toBe(false);
    expect(contentSchema.safeParse(normalizeContent(doc)).success).toBe(true);
  });

  it('returns the same object when nothing needs to change', () => {
    const doc: ContentDoc = { type: 'doc', content: [para('a'), nested(1)] };
    expect(normalizeContent(doc)).toBe(doc);
  });

  it('keeps a quote valid when it only held an empty quote', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'blockquote' }] }],
    };
    expect(normalizeContent(doc)).toEqual({
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'paragraph' }] }],
    });
  });

  it('leaves input that is not content untouched', () => {
    expect(normalizeContent(null)).toBeNull();
    expect(normalizeContent('x')).toBe('x');
    const odd = { type: 'doc', content: 'nope' };
    expect(normalizeContent(odd)).toBe(odd);
  });
});

describe('normalizeContent images (IMG-02, IMG-07)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const image = (assetId: string, caption = ''): ContentNode => ({
    type: 'image',
    attrs: { assetId, size: 'medium', caption },
  });

  it('lifts images out of nested quotes to just after the top-level block, in order', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        para('Intro'),
        {
          type: 'blockquote',
          content: [para('a'), image(A), { type: 'blockquote', content: [image(B), para('b')] }],
        },
        para('End'),
      ],
    };
    const result = normalizeContent(doc);
    expect(result.content?.map((n) => n.type)).toEqual([
      'paragraph',
      'blockquote',
      'image',
      'image',
      'paragraph',
    ]);
    expect(result.content?.[2]?.attrs?.assetId).toBe(A);
    expect(result.content?.[3]?.attrs?.assetId).toBe(B);
    expect(docToPlainText(result)).toBe(docToPlainText(doc));
    expect(contentSchema.safeParse(result).success).toBe(true);
  });

  it('keeps a quote that held only an image valid', () => {
    const doc = { type: 'doc', content: [{ type: 'blockquote', content: [image(A)] }] };
    const result = normalizeContent(doc);
    expect(result.content).toEqual([
      { type: 'blockquote', content: [{ type: 'paragraph' }] },
      image(A),
    ]);
    expect(contentSchema.safeParse(result).success).toBe(true);
  });

  it('drops unknown attributes, fills defaults and truncates long captions', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { assetId: A, src: 'data:image/png;base64,AAAA', size: 'huge' } },
        { type: 'image', attrs: { assetId: B, size: 'small', caption: 'x'.repeat(400) } },
      ],
    };
    const result = normalizeContent(doc);
    expect(result.content?.[0]).toEqual({
      type: 'image',
      attrs: { assetId: A, size: 'medium', caption: '' },
    });
    expect((result.content?.[1]?.attrs?.caption as string).length).toBe(300);
    expect(contentSchema.safeParse(result).success).toBe(true);
  });

  it('does not split a surrogate pair when truncating', () => {
    const doc = {
      type: 'doc',
      content: [image(A, 'x'.repeat(299) + '😀')],
    };
    const caption = normalizeContent(doc).content?.[0]?.attrs?.caption as string;
    expect(caption).toBe('x'.repeat(299));
  });

  it('returns the same object when images are already clean', () => {
    const doc: ContentDoc = { type: 'doc', content: [para('a'), image(A, 'hi'), para('b')] };
    expect(normalizeContent(doc)).toBe(doc);
  });

  it('leaves an invalid asset id as a validation error', () => {
    const doc = normalizeContent({ type: 'doc', content: [image('not-a-uuid')] });
    expect(contentSchema.safeParse(doc).success).toBe(false);
  });
});

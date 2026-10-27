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

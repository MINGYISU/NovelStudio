import { describe, expect, it } from 'vitest';
import { docToPlainText, findInDoc, replaceInDoc } from './prosemirror-text.ts';
import { docFromPlainText, type ContentDoc } from './schemas/content.ts';

const p = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
});

describe('docToPlainText', () => {
  it('separates blocks with blank lines', () => {
    const doc: ContentDoc = { type: 'doc', content: [p('One.'), p('Two.')] };
    expect(docToPlainText(doc)).toBe('One.\n\nTwo.');
  });

  it('turns a horizontal rule into a scene break and keeps headings and quotes', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        p('Before.'),
        { type: 'horizontalRule' },
        { type: 'blockquote', content: [p('Quoted.'), p('More.')] },
      ],
    };
    expect(docToPlainText(doc)).toBe('Title\n\nBefore.\n\n* * *\n\nQuoted.\n\nMore.');
  });

  it('skips images, so plain text and find are unchanged by them', () => {
    const image = {
      type: 'image' as const,
      attrs: { assetId: '11111111-1111-4111-8111-111111111111', size: 'full', caption: 'needle' },
    };
    const plain: ContentDoc = { type: 'doc', content: [p('One.'), p('Two needle.')] };
    const withImages: ContentDoc = {
      type: 'doc',
      content: [image, p('One.'), image, p('Two needle.')],
    };
    expect(docToPlainText(withImages)).toBe(docToPlainText(plain));
    expect(findInDoc(withImages, 'needle', false).count).toBe(1);
    expect(replaceInDoc(withImages, 'needle', 'x', false).count).toBe(1);
  });

  it('renders hard breaks as newlines and drops empty paragraphs', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph' },
        { type: 'paragraph', content: [] },
      ],
    };
    expect(docToPlainText(doc)).toBe('a\nb');
  });

  it('is empty for an empty document', () => {
    expect(docToPlainText({ type: 'doc', content: [] })).toBe('');
  });
});

describe('docFromPlainText', () => {
  it('builds a paragraph per blank-line block and keeps single newlines as breaks', () => {
    const doc = docFromPlainText('First\nline\n\n\nSecond');
    expect(doc.content).toHaveLength(2);
    expect(docToPlainText(doc)).toBe('First\nline\n\nSecond');
  });

  it('round-trips the output of docToPlainText', () => {
    const text = 'One.\n\nTwo with\nbreak.';
    expect(docToPlainText(docFromPlainText(text))).toBe(text);
  });
});

describe('findInDoc / replaceInDoc', () => {
  const bold = (text: string) => ({
    type: 'text' as const,
    text,
    marks: [{ type: 'bold' as const }],
  });
  const doc: ContentDoc = {
    type: 'doc',
    content: [
      p('Anna met anna. ANNA smiled.'),
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Then ' }, bold('Anna'), { type: 'text', text: ' left.' }],
      },
    ],
  };

  it('counts case-insensitively by default and case-sensitively on request', () => {
    expect(findInDoc(doc, 'anna', false).count).toBe(4);
    expect(findInDoc(doc, 'Anna', true).count).toBe(2);
  });

  it('returns excerpts with context, capped', () => {
    const found = findInDoc(doc, 'anna', false, 2);
    expect(found.excerpts).toHaveLength(2);
    expect(found.excerpts[0]).toEqual({
      before: '',
      match: 'Anna',
      after: ' met anna. ANNA smiled.',
    });
  });

  it('does not match across formatting boundaries', () => {
    expect(findInDoc(doc, 'Then Anna', false).count).toBe(0);
    expect(findInDoc(doc, 'Anna left', false).count).toBe(0);
  });

  it('replaces every match, keeps marks, and does not mutate the input', () => {
    const before = JSON.stringify(doc);
    const { doc: next, count } = replaceInDoc(doc, 'anna', 'Bea', false);
    expect(count).toBe(4);
    expect(JSON.stringify(doc)).toBe(before);
    expect(docToPlainText(next)).toBe('Bea met Bea. Bea smiled.\n\nThen Bea left.');
    expect(next.content?.[1]?.content?.[1]?.marks).toEqual([{ type: 'bold' }]);
  });

  it('treats the query and replacement literally', () => {
    const d: ContentDoc = { type: 'doc', content: [p('Cost: $5 (cheap). a.b')] };
    expect(findInDoc(d, '(cheap)', true).count).toBe(1);
    expect(findInDoc(d, 'a.b', true).count).toBe(1);
    expect(findInDoc(d, 'axb', true).count).toBe(0);
    expect(docToPlainText(replaceInDoc(d, '$5', '$&$1', true).doc)).toBe('Cost: $&$1 (cheap). a.b');
  });

  it('drops a text node that becomes empty and works with CJK', () => {
    const d: ContentDoc = { type: 'doc', content: [p('林风笑了。林风走了。')] };
    expect(findInDoc(d, '林风', true).count).toBe(2);
    const { doc: next } = replaceInDoc(d, '林风', '', true);
    expect(docToPlainText(next)).toBe('笑了。走了。');
    const emptied = replaceInDoc({ type: 'doc', content: [p('x')] } as ContentDoc, 'x', '', true);
    expect(emptied.doc.content?.[0]?.content).toEqual([]);
  });

  it('returns the same document when nothing matches', () => {
    expect(replaceInDoc(doc, 'zzz', 'y', false)).toEqual({ doc, count: 0 });
  });
});

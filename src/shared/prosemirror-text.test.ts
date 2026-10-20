import { describe, expect, it } from 'vitest';
import { docToPlainText } from './prosemirror-text.ts';
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

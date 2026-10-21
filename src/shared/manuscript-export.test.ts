import { describe, expect, it } from 'vitest';
import { renderManuscript, type ExportSection } from './manuscript-export.ts';
import type { ContentDoc, ContentNode } from './schemas/content.ts';

const doc = (...content: ContentNode[]): ContentDoc => ({
  type: 'doc',
  content,
});
const para = (...runs: { text: string; marks?: string[] }[]) => ({
  type: 'paragraph' as const,
  content: runs.map((r) => ({
    type: 'text' as const,
    text: r.text,
    ...(r.marks ? { marks: r.marks.map((type) => ({ type: type as 'bold' })) } : {}),
  })),
});

const sections: ExportSection[] = [
  {
    depth: 0,
    displayTitle: 'Volume I — Start',
    doc: doc(),
    plainText: '',
  },
  {
    depth: 1,
    displayTitle: 'Chapter 1 — Reunion',
    doc: doc(
      para({ text: 'Anna ' }, { text: 'smiled', marks: ['bold'] }, { text: '.' }),
      { type: 'horizontalRule' },
      {
        type: 'blockquote',
        content: [para({ text: 'Quoted.' })],
      },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Inner' }] },
    ),
    plainText: '',
  },
  {
    depth: 1,
    displayTitle: '第二章 重逢',
    doc: doc(para({ text: '他回来了。' })),
    plainText: '',
  },
];

describe('renderManuscript', () => {
  it('writes Markdown with headings by depth, marks and scene breaks', () => {
    const md = renderManuscript({ title: 'My Book', author: 'Ann' }, sections, 'md');
    expect(md).toContain('# My Book\n\n*Ann*');
    expect(md).toContain('## Volume I — Start');
    expect(md).toContain(
      '### Chapter 1 — Reunion\n\nAnna **smiled**.\n\n***\n\n> Quoted.\n\n#### Inner',
    );
    expect(md).toContain('### 第二章 重逢\n\n他回来了。');
    expect(md.indexOf('Volume I')).toBeLessThan(md.indexOf('第二章'));
    expect(md.endsWith('\n')).toBe(true);
  });

  it('keeps spaces outside emphasis markers and escapes Markdown characters', () => {
    const md = renderManuscript(
      { title: 'T', author: '' },
      [
        {
          depth: 0,
          displayTitle: 'A',
          doc: doc(para({ text: ' wow ', marks: ['bold'] }, { text: '2 * 3 # not' })),
          plainText: '',
        },
      ],
      'md',
    );
    expect(md).toContain('\n\n**wow** 2 \\* 3 # not');
  });

  it('nests marks and drops underline and highlight', () => {
    const md = renderManuscript(
      { title: 'T', author: '' },
      [
        {
          depth: 0,
          displayTitle: 'A',
          doc: doc(
            para(
              { text: 'both', marks: ['bold', 'italic'] },
              { text: ' u', marks: ['underline'] },
              { text: ' h', marks: ['highlight'] },
            ),
          ),
          plainText: '',
        },
      ],
      'md',
    );
    expect(md).toContain('***both*** u h');
  });

  it('writes plain text with titles, blank lines and * * * for scene breaks', () => {
    const txt = renderManuscript({ title: 'My Book', author: 'Ann' }, sections, 'txt');
    expect(
      txt.startsWith('My Book\n\nby Ann\n\n\nVolume I — Start\n\n\nChapter 1 — Reunion\n\n'),
    ).toBe(true);
    expect(txt).toContain('Anna smiled.\n\n* * *\n\nQuoted.\n\nInner');
    expect(txt).not.toContain('**');
  });

  it('falls back to the stored plain text when the document is unreadable', () => {
    const out = renderManuscript(
      { title: 'T', author: '' },
      [{ depth: 0, displayTitle: 'A', doc: null, plainText: 'One.\n\nTwo.' }],
      'txt',
    );
    expect(out).toBe('T\n\n\nA\n\nOne.\n\nTwo.\n');
  });
});

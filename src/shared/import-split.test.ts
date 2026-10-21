import { describe, expect, it } from 'vitest';
import { decodeImportText, FRONT_MATTER_TITLE, ImportError, splitImport } from './import-split.ts';

const txt = { markdown: false, detect: true };
const md = { markdown: true, detect: true };

describe('splitImport: Chinese headings (PRD scenario 15)', () => {
  const text = [
    '第一章 重逢',
    '他回来了。',
    '',
    '第二章',
    '雨下了一夜。',
    '第三章：离别',
    '再见。',
  ].join('\n');

  it('splits on 第…章 headings, strips the number and keeps untitled ones empty', () => {
    const plan = splitImport(text, txt);
    expect(plan.detected).toBe(true);
    expect(plan.suggestedPreset).toBe('chinese');
    expect(plan.sections.map((s) => [s.kind, s.title])).toEqual([
      ['chapter', '重逢'],
      ['chapter', ''],
      ['chapter', '离别'],
    ]);
    expect(plan.sections[0]?.plainText).toBe('他回来了。');
    expect(plan.sections[0]?.wordCount).toBe(4);
  });

  it('puts text before the first heading into an unnumbered front matter chapter', () => {
    const plan = splitImport(`作者的话\n\n第一章 开始\n正文`, txt);
    expect(plan.sections[0]).toMatchObject({ title: FRONT_MATTER_TITLE, unnumbered: true });
    expect(plan.sections[1]).toMatchObject({ title: '开始', unnumbered: false });
  });

  it('makes 卷/部/篇 volumes and nests the following chapters under them', () => {
    const plan = splitImport(
      ['第一卷 起', '第一章 甲', 'a', '第二章 乙', 'b', '第二卷 承', '第三章 丙', 'c'].join('\n'),
      txt,
    );
    expect(plan.sections.map((s) => [s.kind, s.title, s.parentIndex])).toEqual([
      ['volume', '起', null],
      ['chapter', '甲', 0],
      ['chapter', '乙', 0],
      ['volume', '承', null],
      ['chapter', '丙', 3],
    ]);
  });

  it('ignores long lines that merely start like a heading', () => {
    const long = `第三章已经结束了，${'他'.repeat(120)}`;
    const plan = splitImport(`第一章 甲\n${long}`, txt);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]?.plainText).toBe(long);
  });
});

describe('splitImport: English headings', () => {
  it('detects Chapter N and CHAPTER XII with several separators', () => {
    const plan = splitImport(
      ['Chapter 1: The Start', 'One.', 'CHAPTER XII', 'Two.', 'Chapter 3 - Home', 'Three.'].join(
        '\n',
      ),
      txt,
    );
    expect(plan.suggestedPreset).toBe('english');
    expect(plan.sections.map((s) => s.title)).toEqual(['The Start', '', 'Home']);
  });

  it('does not treat words such as "Chapters" or "Chapter Mix" as headings', () => {
    const plan = splitImport('Chapters are fun.\nChapter Mix is not a heading.', txt);
    expect(plan.detected).toBe(false);
    expect(plan.sections).toHaveLength(1);
  });
});

describe('splitImport: Markdown', () => {
  it('turns every heading into a chapter when only # headings exist', () => {
    const plan = splitImport('# One\nText\n# Two\nMore', md);
    expect(plan.sections.map((s) => [s.kind, s.title])).toEqual([
      ['chapter', 'One'],
      ['chapter', 'Two'],
    ]);
  });

  it('makes # a volume only when ## headings also exist', () => {
    const plan = splitImport('# Book I\n## A\nx\n## B\ny\n# Book II\n## C\nz', md);
    expect(plan.sections.map((s) => [s.kind, s.title, s.parentIndex])).toEqual([
      ['volume', 'Book I', null],
      ['chapter', 'A', 0],
      ['chapter', 'B', 0],
      ['volume', 'Book II', null],
      ['chapter', 'C', 3],
    ]);
  });

  it('does not treat # lines as headings in plain text files, and ignores ###', () => {
    expect(splitImport('# Not a heading', txt).detected).toBe(false);
    expect(splitImport('# One\n### Deeper\ntext', md).sections).toHaveLength(1);
  });

  it('strips the number from "# Chapter 3: X"', () => {
    const plan = splitImport('# Chapter 3: The Gate\nbody', md);
    expect(plan.sections[0]?.title).toBe('The Gate');
  });

  it('converts **bold** and *italic* and leaves unmatched asterisks alone', () => {
    const plan = splitImport('# T\nA **bold** and *soft* word, 2 * 3 = 6 and *open', md);
    const para = plan.sections[0]?.content.content?.[0]?.content;
    expect(para?.map((n) => [n.text, n.marks?.[0]?.type])).toEqual([
      ['A ', undefined],
      ['bold', 'bold'],
      [' and ', undefined],
      ['soft', 'italic'],
      [' word, 2 * 3 = 6 and *open', undefined],
    ]);
  });

  it('keeps asterisks literal in plain text files', () => {
    const plan = splitImport('第一章 甲\n**x**', txt);
    expect(plan.sections[0]?.plainText).toBe('**x**');
  });
});

describe('splitImport: structure of the text', () => {
  it('makes one paragraph per non-empty line and scene breaks into rules', () => {
    const plan = splitImport('第一章 甲\n一\n\n二\n***\n三', txt);
    expect(plan.sections[0]?.content.content?.map((n) => n.type)).toEqual([
      'paragraph',
      'paragraph',
      'horizontalRule',
      'paragraph',
    ]);
  });

  it('accepts CRLF and a BOM', () => {
    const plan = splitImport('\uFEFFChapter 1\r\nHello\r\n\r\nChapter 2\r\nWorld', txt);
    expect(plan.sections.map((s) => s.plainText)).toEqual(['Hello', 'World']);
  });

  it('keeps everything in one section when detection is off', () => {
    const plan = splitImport('第一章 甲\nx\n第二章 乙\ny', {
      ...txt,
      detect: false,
      fallbackTitle: 'My novel',
    });
    expect(plan.detected).toBe(false);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]).toMatchObject({ title: 'My novel', kind: 'chapter' });
    expect(plan.sections[0]?.plainText).toBe('第一章 甲\n\nx\n\n第二章 乙\n\ny');
  });

  it('uses a single section when no heading is found, and nothing for blank input', () => {
    expect(splitImport('Just a story.', txt).sections).toHaveLength(1);
    expect(splitImport('  \n\n', txt).sections).toHaveLength(0);
  });

  it('refuses an absurd number of sections', () => {
    const many = Array.from({ length: 3001 }, (_, i) => `Chapter ${i + 1}\nx`).join('\n');
    expect(() => splitImport(many, txt)).toThrow(ImportError);
  });

  it('shortens over-long headings with a warning', () => {
    const plan = splitImport(`# ${'a'.repeat(300)}\nx`, md);
    expect(plan.sections[0]?.title).toHaveLength(200);
    expect(plan.warnings).toHaveLength(1);
  });
});

describe('decodeImportText', () => {
  it('decodes UTF-8 and strips a BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('第一章')]);
    expect(decodeImportText(bytes)).toEqual({ text: '第一章', encoding: 'UTF-8' });
  });

  it('falls back to GB18030', () => {
    const bytes = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2]);
    expect(decodeImportText(bytes)).toEqual({ text: '第一章', encoding: 'GB18030' });
  });

  it('rejects binary data', () => {
    expect(() => decodeImportText(new Uint8Array([0x50, 0x4b, 0x00, 0x04]))).toThrow(ImportError);
  });
});

import { docToPlainText } from './prosemirror-text.ts';
import { DEFAULT_LOCALE, type Locale } from './schemas/locale.ts';
import { imagePlaceholder } from './seed-text.ts';
import type { ContentDoc, ContentMark, ContentNode } from './schemas/content.ts';

export type ExportFormat = 'md' | 'txt';

export interface ExportSection {
  /** Depth in the tree; 0 is the book root. */
  depth: number;
  displayTitle: string;
  /** Null when the stored text is unreadable; `plainText` is used instead. */
  doc: ContentDoc | null;
  plainText: string;
}

export interface ExportBook {
  title: string;
  author: string;
}

const MAX_HEADING = 6;

function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_`~[\]<]/g, '\\$&').replace(/^(\s*)([#>+-]|\d+[.)])/, '$1\\$2');
}

const MARK_WRAP: Partial<Record<ContentMark['type'], string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
};

function inlineMarkdown(node: ContentNode): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return (node.content ?? []).map(inlineMarkdown).join('');
  const text = node.text ?? '';
  const wraps = (node.marks ?? []).map((m) => MARK_WRAP[m.type]).filter((w): w is string => !!w);
  if (wraps.length === 0) return escapeMarkdown(text);
  // Emphasis markers hug the words; surrounding spaces stay outside them.
  const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
  if (core === '') return escapeMarkdown(text);
  const open = wraps.join('');
  const close = [...wraps].reverse().join('');
  return `${lead}${open}${escapeMarkdown(core)}${close}${trail}`;
}

function captionOf(node: ContentNode): string {
  const caption = node.attrs?.caption;
  return typeof caption === 'string' ? caption : '';
}

function blocksMarkdown(
  node: ContentNode,
  headingBase: number,
  quote: boolean,
  lang: Locale,
): string[] {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).flatMap((c) => blocksMarkdown(c, headingBase, quote, lang));
    case 'blockquote':
      return (node.content ?? []).flatMap((c) => blocksMarkdown(c, headingBase, true, lang));
    case 'image':
      return [imagePlaceholder(escapeMarkdown(captionOf(node)), lang)];
    case 'horizontalRule':
      return [quote ? '> ***' : '***'];
    case 'heading': {
      const text = inlineMarkdown(node).trim();
      if (text === '') return [];
      const level = Math.min(MAX_HEADING, headingBase + Number(node.attrs?.level ?? 1));
      return [`${'#'.repeat(level)} ${text}`];
    }
    default: {
      const text = inlineMarkdown(node).trim();
      if (text === '') return [];
      return [quote ? text.replace(/^/gm, '> ') : text];
    }
  }
}

function sectionMarkdown(section: ExportSection, lang: Locale): string {
  const level = Math.min(MAX_HEADING, 2 + section.depth);
  const parts = [`${'#'.repeat(level)} ${escapeMarkdown(section.displayTitle)}`];
  if (section.doc) parts.push(...blocksMarkdown(section.doc, level, false, lang));
  else if (section.plainText.trim() !== '') {
    parts.push(...section.plainText.split(/\n{2,}/).map(escapeMarkdown));
  }
  return parts.join('\n\n');
}

/** Plain text of a document with each image as its own placeholder line; images are top-level only. */
function docToExportText(doc: ContentDoc, lang: Locale): string {
  const blocks: string[] = [];
  let run: ContentNode[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const text = docToPlainText({ type: 'doc', content: run });
    if (text !== '') blocks.push(text);
    run = [];
  };
  for (const node of doc.content ?? []) {
    if (node.type === 'image') {
      flush();
      blocks.push(imagePlaceholder(captionOf(node), lang));
    } else run.push(node);
  }
  flush();
  return blocks.join('\n\n');
}

function sectionText(section: ExportSection, lang: Locale): string {
  const body = section.doc ? docToExportText(section.doc, lang) : section.plainText;
  return body.trim() === '' ? section.displayTitle : `${section.displayTitle}\n\n${body}`;
}

/** Manuscript export (EXP-01): sections in the order given (reading order), trashed ones already left out. */
export function renderManuscript(
  book: ExportBook,
  sections: readonly ExportSection[],
  format: ExportFormat,
  lang: Locale = DEFAULT_LOCALE,
): string {
  const head =
    format === 'md'
      ? [
          `# ${escapeMarkdown(book.title)}`,
          ...(book.author ? [`*${escapeMarkdown(book.author)}*`] : []),
        ]
      : [book.title, ...(book.author ? [`by ${book.author}`] : [])];
  const body = sections.map((s) =>
    format === 'md' ? sectionMarkdown(s, lang) : sectionText(s, lang),
  );
  return [head.join('\n\n'), ...body].join('\n\n\n').trimEnd() + '\n';
}

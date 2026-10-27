import { docToPlainText } from './prosemirror-text.ts';
import type { ContentDoc, ContentNode } from './schemas/content.ts';
import { NODE_TITLE_MAX } from './schemas/node.ts';
import { countWords } from './wordcount.ts';

export const FRONT_MATTER_TITLE = 'Front matter';
export const DEFAULT_SINGLE_TITLE = 'Imported text';
/** More sections than this almost always means the headings were misdetected. */
export const IMPORT_MAX_SECTIONS = 3000;
/** Longer lines are body text that happens to start like a heading. */
const HEADING_MAX_CHARS = 100;

const ZH_HEADING = /^\s*第([0-9０-９一二三四五六七八九十百千万零〇两]+)([章回节卷部篇])(.*)$/u;
const ZH_TITLE_SEPARATOR = /^[ \t\u3000：:、．.—-]/u;
const ZH_TITLE_MAX_CHARS = 20;
const ZH_SENTENCE_END = /[。！？；…]$/u;
const ZH_CLOSING_QUOTES = /[”」』]+$/u;
const EN_HEADING = /^\s*(?:Chapter|CHAPTER)\s+(?:[0-9]+|[IVXLCDM]+)\b[\s.:—-]*(.*)$/;
const MD_HEADING = /^(#{1,2})\s+(.*)$/;
const SCENE_BREAK_LINE = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const TITLE_LEAD = /^[\s:：.、—-]+/u;

export interface ImportDraftSection {
  kind: 'volume' | 'chapter';
  title: string;
  /** Index into the same list, or null for the book root. */
  parentIndex: number | null;
  /** Front matter never consumes a chapter number. */
  unnumbered: boolean;
  content: ContentDoc;
  plainText: string;
  wordCount: number;
}

export interface ImportPlan {
  sections: ImportDraftSection[];
  /** True when headings were found and used; false for a single section. */
  detected: boolean;
  /** Chinese-style headings (`第…章`) suggest the Chinese numbering preset. */
  suggestedPreset: 'english' | 'chinese';
  warnings: string[];
}

export interface SplitOptions {
  /** Markdown `#`/`##` headings and `**bold**`/`*italic*` are only understood in Markdown files. */
  markdown: boolean;
  /** Off = the whole text becomes one section. */
  detect: boolean;
  /** Title of the single section when nothing is split. */
  fallbackTitle?: string;
}

export class ImportError extends Error {
  constructor(
    readonly code: 'EMPTY' | 'TOO_MANY_SECTIONS' | 'NOT_TEXT' | 'ENCODING',
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** UTF-8 (BOM stripped) first, then GB18030; anything else is refused rather than guessed. */
export function decodeImportText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes.includes(0)) {
    throw new ImportError('NOT_TEXT', 'This does not look like a text file.');
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^\uFEFF/, ''), encoding: 'UTF-8' };
  } catch {
    // fall through to the Chinese legacy encoding
  }
  try {
    const text = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
    return { text, encoding: 'GB18030' };
  } catch {
    throw new ImportError('ENCODING', 'The file is neither UTF-8 nor GB18030 text.');
  }
}

interface Heading {
  line: number;
  kind: 'volume' | 'chapter';
  /** Markdown level (1 or 2) when the heading came from `#`/`##`; the kind is decided later. */
  mdLevel: 1 | 2 | null;
  title: string;
  zh: boolean;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(TITLE_LEAD, '')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/**
 * After `第<number><marker>` the rest of the line is the title (ARCHITECTURE §12). Prose such as
 * `第二节课下课后，她走出教室。` or `第二部手机响了。` starts the same way, so the line is a heading only
 * if the title is empty, starts with a separator, or is short and has no comma; and it must not end
 * like a sentence (closing quotes ignored).
 */
export function isChineseHeadingTitle(rest: string): boolean {
  const title = rest.replace(/\s+$/u, '');
  if (title === '') return true;
  const shaped =
    ZH_TITLE_SEPARATOR.test(title) ||
    ([...title].length <= ZH_TITLE_MAX_CHARS && !title.includes('，'));
  return shaped && !ZH_SENTENCE_END.test(title.replace(ZH_CLOSING_QUOTES, ''));
}

function matchNumbered(
  line: string,
): { kind: 'volume' | 'chapter'; title: string; zh: boolean } | null {
  if (line.length > HEADING_MAX_CHARS) return null;
  const zh = ZH_HEADING.exec(line);
  if (zh && isChineseHeadingTitle(zh[3] ?? '')) {
    const unit = zh[2] ?? '';
    return {
      kind: '卷部篇'.includes(unit) ? 'volume' : 'chapter',
      title: cleanTitle(zh[3] ?? ''),
      zh: true,
    };
  }
  const en = EN_HEADING.exec(line);
  if (en) return { kind: 'chapter', title: cleanTitle(en[1] ?? ''), zh: false };
  return null;
}

function detectHeading(line: string, lineNo: number, markdown: boolean): Heading | null {
  const md = markdown ? MD_HEADING.exec(line) : null;
  if (md) {
    const text = (md[2] ?? '').trim();
    // "# Chapter 3: Title" keeps only the title; the number is recomputed.
    const numbered = matchNumbered(text);
    return {
      line: lineNo,
      kind: 'chapter',
      mdLevel: (md[1] ?? '#').length === 1 ? 1 : 2,
      title: numbered ? numbered.title : cleanTitle(text),
      zh: numbered?.zh ?? false,
    };
  }
  const numbered = matchNumbered(line);
  return numbered ? { line: lineNo, mdLevel: null, ...numbered } : null;
}

/** `**bold**` and `*italic*`; unmatched asterisks stay literal text. */
function inlineNodes(line: string, markdown: boolean): ContentNode[] {
  if (!markdown || !line.includes('*')) return line === '' ? [] : [{ type: 'text', text: line }];
  const nodes: ContentNode[] = [];
  const re = /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=\S)([^*]+?)(?<=\S)\*/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) nodes.push({ type: 'text', text: line.slice(last, m.index) });
    const bold = m[1] !== undefined;
    nodes.push({
      type: 'text',
      text: bold ? m[1] : m[2],
      marks: [{ type: bold ? 'bold' : 'italic' }],
    });
    last = m.index + m[0].length;
  }
  if (last < line.length) nodes.push({ type: 'text', text: line.slice(last) });
  return nodes;
}

/** Every non-empty line is one paragraph; blank lines only separate. */
function bodyToDoc(lines: readonly string[], markdown: boolean): ContentDoc {
  const content: ContentNode[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (SCENE_BREAK_LINE.test(line)) {
      content.push({ type: 'horizontalRule' });
    } else {
      content.push({ type: 'paragraph', content: inlineNodes(line, markdown) });
    }
  }
  return { type: 'doc', content };
}

function draft(
  kind: ImportDraftSection['kind'],
  title: string,
  parentIndex: number | null,
  unnumbered: boolean,
  lines: readonly string[],
  markdown: boolean,
): ImportDraftSection {
  const content = bodyToDoc(lines, markdown);
  const plainText = docToPlainText(content);
  return {
    kind,
    title,
    parentIndex,
    unnumbered,
    content,
    plainText,
    wordCount: countWords(plainText),
  };
}

/** Splits decoded TXT/Markdown text into sections (IMP-02); pure, nothing is written. */
export function splitImport(input: string, options: SplitOptions): ImportPlan {
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const warnings: string[] = [];
  const fallbackTitle = options.fallbackTitle?.trim() || DEFAULT_SINGLE_TITLE;

  const headings: Heading[] = [];
  if (options.detect) {
    lines.forEach((line, i) => {
      const h = detectHeading(line, i, options.markdown);
      if (h) headings.push(h);
    });
  }

  const single = (): ImportPlan => ({
    sections: lines.some((l) => l.trim() !== '')
      ? [draft('chapter', fallbackTitle, null, false, lines, options.markdown)]
      : [],
    detected: false,
    suggestedPreset: 'english',
    warnings,
  });
  if (headings.length === 0) return single();

  // `#` is a volume only when `##` headings also exist; otherwise every heading is a chapter.
  const mdVolumes = headings.some((h) => h.mdLevel === 2);
  for (const h of headings) {
    if (h.mdLevel !== null) h.kind = mdVolumes && h.mdLevel === 1 ? 'volume' : 'chapter';
  }

  const sections: ImportDraftSection[] = [];
  const firstHeading = headings[0]?.line ?? 0;
  if (lines.slice(0, firstHeading).some((l) => l.trim() !== '')) {
    sections.push(
      draft(
        'chapter',
        FRONT_MATTER_TITLE,
        null,
        true,
        lines.slice(0, firstHeading),
        options.markdown,
      ),
    );
  }

  let currentVolume: number | null = null;
  headings.forEach((h, i) => {
    const end = headings[i + 1]?.line ?? lines.length;
    let title = h.title;
    if (title.length > NODE_TITLE_MAX) {
      title = title.slice(0, NODE_TITLE_MAX);
      warnings.push(`A very long heading was shortened to ${NODE_TITLE_MAX} characters.`);
    }
    const parentIndex = h.kind === 'volume' ? null : currentVolume;
    sections.push(
      draft(h.kind, title, parentIndex, false, lines.slice(h.line + 1, end), options.markdown),
    );
    if (h.kind === 'volume') currentVolume = sections.length - 1;
  });

  if (sections.length > IMPORT_MAX_SECTIONS) {
    throw new ImportError(
      'TOO_MANY_SECTIONS',
      `${sections.length} sections were detected (the limit is ${IMPORT_MAX_SECTIONS}). Turn chapter detection off or check the file's headings.`,
    );
  }

  return {
    sections,
    detected: true,
    suggestedPreset: headings.some((h) => h.zh) ? 'chinese' : 'english',
    warnings: [...new Set(warnings)],
  };
}

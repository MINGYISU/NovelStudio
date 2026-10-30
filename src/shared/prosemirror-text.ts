import type { ContentNode } from './schemas/content.ts';

const SCENE_BREAK = '* * *';

function inlineText(node: ContentNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockTexts(node: ContentNode): string[] {
  switch (node.type) {
    case 'horizontalRule':
      return [SCENE_BREAK];
    case 'image':
      return [];
    case 'blockquote':
      return (node.content ?? []).flatMap(blockTexts);
    case 'doc':
      return (node.content ?? []).flatMap(blockTexts);
    default: {
      const text = inlineText(node);
      return text.trim() === '' ? [] : [text];
    }
  }
}

/**
 * Readable text of a document: one block per paragraph, heading or quote paragraph, separated by
 * blank lines; a scene break becomes `* * *`; empty paragraphs are dropped.
 */
export function docToPlainText(doc: ContentNode): string {
  return blockTexts(doc).join('\n\n');
}

export const MATCH_CONTEXT_CHARS = 40;

export interface MatchExcerpt {
  before: string;
  match: string;
  after: string;
}

export interface DocMatches {
  count: number;
  excerpts: MatchExcerpt[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(query: string, caseSensitive: boolean): RegExp {
  return new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu');
}

/** Visits every text node; matches never leave one, so they never span a formatting boundary. */
function walkText(node: ContentNode, visit: (text: string) => void): void {
  if (node.type === 'text') {
    if (node.text) visit(node.text);
    return;
  }
  for (const child of node.content ?? []) walkText(child, visit);
}

/** Counts non-overlapping matches inside single text nodes and returns the first few with context. */
export function findInDoc(
  doc: ContentNode,
  query: string,
  caseSensitive: boolean,
  maxExcerpts = 3,
): DocMatches {
  const result: DocMatches = { count: 0, excerpts: [] };
  if (query === '') return result;
  const re = matcher(query, caseSensitive);
  walkText(doc, (text) => {
    for (const m of text.matchAll(re)) {
      result.count += 1;
      if (result.excerpts.length < maxExcerpts) {
        const start = m.index;
        result.excerpts.push({
          before: text.slice(Math.max(0, start - MATCH_CONTEXT_CHARS), start),
          match: m[0],
          after: text.slice(start + m[0].length, start + m[0].length + MATCH_CONTEXT_CHARS),
        });
      }
    }
  });
  return result;
}

/** A copy of the document with every match replaced; marks stay on the replaced text. */
export function replaceInDoc<T extends ContentNode>(
  doc: T,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): { doc: T; count: number } {
  if (query === '') return { doc, count: 0 };
  const re = matcher(query, caseSensitive);
  let count = 0;

  const rewrite = (node: ContentNode): ContentNode => {
    if (node.type === 'text') {
      const text = node.text ?? '';
      const next = text.replace(re, () => {
        count += 1;
        return replacement;
      });
      return next === text ? node : { ...node, text: next };
    }
    if (!node.content) return node;
    const content = node.content.map(rewrite).filter((c) => c.type !== 'text' || c.text !== '');
    return { ...node, content };
  };

  const next = rewrite(doc) as T;
  return count === 0 ? { doc, count: 0 } : { doc: next, count };
}

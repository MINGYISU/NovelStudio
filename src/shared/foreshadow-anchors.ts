import type { ContentMark, ContentNode } from './schemas/content.ts';

export const ANCHOR_MARK = 'foreshadowAnchor';
/** The HTML attribute that carries an anchor through the clipboard. */
export const ANCHOR_ATTRIBUTE = 'data-foreshadow-anchor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isOccurrenceId = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

const isAnchor = (mark: ContentMark): boolean => mark.type === ANCHOR_MARK;

function anchorId(mark: ContentMark): string | null {
  const id = mark.attrs?.occurrenceId;
  return isAnchor(mark) && typeof id === 'string' ? id : null;
}

/** Every occurrence id anchored somewhere in the document (ARCHITECTURE §11), each once. */
export function extractAnchorIds(doc: ContentNode): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ContentNode): void => {
    for (const mark of node.marks ?? []) {
      const id = anchorId(mark);
      if (id !== null) ids.add(id);
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return ids;
}

function mapMarks(node: ContentNode, fn: (mark: ContentMark) => ContentMark | null): ContentNode {
  const result: ContentNode = { ...node };
  if (node.marks) {
    const marks = node.marks.flatMap((m) => {
      const next = fn(m);
      return next === null ? [] : [next];
    });
    if (marks.length > 0) result.marks = marks;
    else delete result.marks;
  }
  if (node.content) result.content = node.content.map((child) => mapMarks(child, fn));
  return result;
}

/** A copy of the document with every anchor id passed through `remap`; ids it does not know are kept. */
export function remapAnchorIds<T extends ContentNode>(
  doc: T,
  remap: (id: string) => string | undefined,
): T {
  return mapMarks(doc, (mark) => {
    const id = anchorId(mark);
    if (id === null) return mark;
    return { ...mark, attrs: { ...mark.attrs, occurrenceId: remap(id) ?? id } };
  }) as T;
}

/** A copy of the document without any anchor marks; the text and other formatting stay. */
export function stripAnchors<T extends ContentNode>(doc: T): T {
  return mapMarks(doc, (mark) => (isAnchor(mark) ? null : mark)) as T;
}

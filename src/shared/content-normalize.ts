/**
 * Content shape fixes applied before validation and storage (ED-02, ARCHITECTURE §8).
 *
 * Blockquotes never nest: a quote inside a quote is unwrapped and its children are spliced into
 * the outer quote in place, so text, marks and order stay exactly the same. Without this, a pasted
 * email thread could exceed the content depth limit and make a section unsaveable.
 *
 * Works on unvalidated input (the server normalizes before validating): anything that does not
 * look like a content node is returned unchanged. Returns the same object when nothing changes.
 */
export function normalizeContent<T>(doc: T): T {
  const [result] = flatten(doc, false);
  return result as T;
}

interface LooseNode {
  type?: unknown;
  content?: unknown;
}

function isNode(value: unknown): value is LooseNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flatten(node: unknown, insideQuote: boolean): unknown[] {
  if (!isNode(node)) return [node];
  const isQuote = node.type === 'blockquote';
  if (!Array.isArray(node.content))
    return isQuote && insideQuote && !('content' in node) ? [] : [node];
  const children: unknown[] = node.content;
  let changed = false;
  const next: unknown[] = [];
  for (const child of children) {
    const replaced = flatten(child, insideQuote || isQuote);
    if (replaced.length !== 1 || replaced[0] !== child) changed = true;
    next.push(...replaced);
  }
  if (isQuote && insideQuote) return next;
  if (!changed) return [node];
  // A quote must hold at least one block; one that only held empty quotes gets an empty paragraph.
  const content =
    isQuote && next.length === 0 && children.length > 0 ? [{ type: 'paragraph' }] : next;
  return [{ ...node, content }];
}

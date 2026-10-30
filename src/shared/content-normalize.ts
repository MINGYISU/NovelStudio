const IMAGE_SIZES: readonly unknown[] = ['small', 'medium', 'full'];
const DEFAULT_IMAGE_SIZE = 'medium';
const IMAGE_CAPTION_MAX = 300;

/**
 * Content shape fixes applied before validation and storage (ED-02, ARCHITECTURE §8).
 *
 * Blockquotes never nest: a quote inside a quote is unwrapped and its children are spliced into
 * the outer quote in place, so text, marks and order stay exactly the same. Without this, a pasted
 * email thread could exceed the content depth limit and make a section unsaveable.
 *
 * Images (IMG-02, IMG-07) only live at the top level: one found anywhere deeper is moved to just
 * after the top-level block that contained it, in order. Image attributes are reduced to
 * `assetId`, `size` and `caption`, with defaults filled in and a long caption cut, so an image can
 * never make a section unsaveable. Whether the asset exists is never checked.
 *
 * Works on unvalidated input (the server normalizes before validating): anything that does not
 * look like a content node is returned unchanged. Returns the same object when nothing changes.
 */
export function normalizeContent<T>(doc: T): T {
  const [result] = flatten(doc, false);
  return liftImages(result) as T;
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

function canonicalImage(node: LooseNode & { attrs?: unknown }): unknown {
  const attrs = isNode(node.attrs) ? (node.attrs as Record<string, unknown>) : {};
  const size = IMAGE_SIZES.includes(attrs.size) ? attrs.size : DEFAULT_IMAGE_SIZE;
  let caption = typeof attrs.caption === 'string' ? attrs.caption : '';
  if (caption.length > IMAGE_CAPTION_MAX) {
    caption = caption.slice(0, IMAGE_CAPTION_MAX);
    const last = caption.charCodeAt(caption.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) caption = caption.slice(0, -1);
  }
  const keys = Object.keys(attrs);
  const canonical =
    Object.keys(node).length === 2 &&
    keys.length === 3 &&
    attrs.size === size &&
    attrs.caption === caption &&
    'assetId' in attrs;
  if (canonical) return node;
  return { type: 'image', attrs: { assetId: attrs.assetId, size, caption } };
}

/** Removes every image found below `node`, returning them in document order (same node if none). */
function extractImages(node: unknown): { node: unknown; images: unknown[] } {
  if (!isNode(node) || !Array.isArray(node.content)) return { node, images: [] };
  const images: unknown[] = [];
  let changed = false;
  const content: unknown[] = [];
  for (const child of node.content) {
    if (isNode(child) && child.type === 'image') {
      images.push(canonicalImage(child));
      changed = true;
      continue;
    }
    const inner = extractImages(child);
    if (inner.node !== child) changed = true;
    images.push(...inner.images);
    content.push(inner.node);
  }
  if (!changed) return { node, images };
  if (content.length === 0 && node.type === 'blockquote') content.push({ type: 'paragraph' });
  const rewritten: Record<string, unknown> = { ...node };
  if (content.length > 0) rewritten.content = content;
  else delete rewritten.content;
  return { node: rewritten, images };
}

function liftImages(doc: unknown): unknown {
  if (!isNode(doc) || doc.type !== 'doc' || !Array.isArray(doc.content)) return doc;
  let changed = false;
  const next: unknown[] = [];
  for (const block of doc.content) {
    if (isNode(block) && block.type === 'image') {
      const image = canonicalImage(block);
      if (image !== block) changed = true;
      next.push(image);
      continue;
    }
    const { node, images } = extractImages(block);
    if (node !== block) changed = true;
    next.push(node, ...images);
  }
  return changed ? { ...doc, content: next } : doc;
}

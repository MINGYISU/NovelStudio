import type { ContentNode } from './schemas/content.ts';

/** Every asset id referenced by an `image` node of the document, each once. Images are top-level only. */
export function collectImageAssetIds(doc: ContentNode): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ContentNode): void => {
    if (node.type === 'image' && typeof node.attrs?.assetId === 'string') {
      ids.add(node.attrs.assetId);
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return ids;
}

/** A copy with every image's asset id passed through `remap`; an id it returns `undefined` for is kept. */
export function remapImageAssetIds<T extends ContentNode>(
  doc: T,
  remap: (id: string) => string | undefined,
): T {
  const visit = (node: ContentNode): ContentNode => {
    if (node.type === 'image' && typeof node.attrs?.assetId === 'string') {
      const next = remap(node.attrs.assetId);
      return next === undefined || next === node.attrs.assetId
        ? node
        : { ...node, attrs: { ...node.attrs, assetId: next } };
    }
    if (!node.content) return node;
    let changed = false;
    const content = node.content.map((child) => {
      const mapped = visit(child);
      if (mapped !== child) changed = true;
      return mapped;
    });
    return changed ? { ...node, content } : node;
  };
  return visit(doc) as T;
}

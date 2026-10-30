import { describe, expect, it } from 'vitest';
import { collectImageAssetIds, remapImageAssetIds } from './content-images.ts';
import type { ContentDoc, ContentNode } from './schemas/content.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const image = (assetId: string): ContentNode => ({
  type: 'image',
  attrs: { assetId, size: 'medium', caption: 'kept' },
});
const para: ContentNode = { type: 'paragraph', content: [{ type: 'text', text: 'Words' }] };
const doc: ContentDoc = { type: 'doc', content: [para, image(A), para, image(B), image(A)] };

describe('collectImageAssetIds', () => {
  it('lists each referenced asset once', () => {
    expect([...collectImageAssetIds(doc)]).toEqual([A, B]);
    expect(collectImageAssetIds({ type: 'doc', content: [para] }).size).toBe(0);
  });
});

describe('remapImageAssetIds', () => {
  it('replaces mapped ids, keeps unmapped ones and everything else', () => {
    const next = remapImageAssetIds(doc, (id) => (id === A ? C : undefined));
    expect(next.content?.map((n) => n.attrs?.assetId)).toEqual([undefined, C, undefined, B, C]);
    expect(next.content?.[1]?.attrs).toEqual({ assetId: C, size: 'medium', caption: 'kept' });
    expect(next.content?.[0]).toBe(para);
  });

  it('returns the same document when nothing maps', () => {
    expect(remapImageAssetIds(doc, () => undefined)).toBe(doc);
  });
});

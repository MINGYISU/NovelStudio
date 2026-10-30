import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetListResponse } from '../shared/schemas/book.ts';
import type { ContentDoc } from '../shared/schemas/content.ts';
import { Harness, multipartBody, paragraphs, TINY_PNG } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function upload(bookId: string, fileName = 'pic.png'): Promise<{ id: string; url: string }> {
  const form = multipartBody([{ name: 'file', filename: fileName, data: TINY_PNG }]);
  const res = await h.app.inject({ method: 'POST', url: `/api/books/${bookId}/assets`, ...form });
  expect(res.statusCode).toBe(201);
  return res.json();
}

const imageDoc = (assetId: string, caption = ''): ContentDoc => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before.' }] },
    { type: 'image', attrs: { assetId, size: 'medium', caption } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] },
  ],
});

const fileExists = (bookId: string, assetId: string) =>
  fs.existsSync(path.join(h.store.paths.assetsDir, bookId, `${assetId}.png`));

async function chapter(bookId: string, title = 'One') {
  const node = await h.createNode(bookId, 'chapter', null, title);
  return node;
}

async function rev(nodeId: string): Promise<number> {
  return (await h.api('GET', `/api/nodes/${nodeId}`)).json().node.rev;
}

async function save(nodeId: string, doc: ContentDoc) {
  const res = await h.saveContent(nodeId, doc, await rev(nodeId));
  expect(res.statusCode).toBe(200);
}

describe('images in the text (IMG-02, IMG-07, IMG-11)', () => {
  it('saves an image whose asset does not exist', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const res = await h.saveContent(node.id, imageDoc(MISSING, 'Gone'), 0);
    expect(res.statusCode).toBe(200);
    const stored = (await h.api('GET', `/api/nodes/${node.id}`)).json().node.content;
    expect(stored.content[1]).toEqual({
      type: 'image',
      attrs: { assetId: MISSING, size: 'medium', caption: 'Gone' },
    });
  });

  it('stores an image inside a quote lifted out after it, and counts no words for images', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Quoted words.' }] },
            { type: 'image', attrs: { assetId: MISSING } },
          ],
        },
      ],
    };
    const res = await h.api('PUT', `/api/nodes/${node.id}/content`, { content: doc, rev: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.json().wordCount).toBe(2);
    const stored = (await h.api('GET', `/api/nodes/${node.id}`)).json().node.content;
    expect(stored.content.map((n: { type: string }) => n.type)).toEqual(['blockquote', 'image']);
    expect(stored.content[1].attrs).toEqual({ assetId: MISSING, size: 'medium', caption: '' });
  });

  it('truncates a long caption and refuses an image that is not a UUID', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const long = await h.saveContent(node.id, imageDoc(MISSING, 'x'.repeat(500)), 0);
    expect(long.statusCode).toBe(200);
    const stored = (await h.api('GET', `/api/nodes/${node.id}`)).json().node.content;
    expect(stored.content[1].attrs.caption).toHaveLength(300);

    const bad = await h.saveContent(node.id, imageDoc('data:image/png;base64,AAAA'), 1);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('exports image lines in the language of the request (EXP-01)', async () => {
    const book = await h.createBook('Pictures');
    const node = await chapter(book.id);
    await save(node.id, imageDoc(MISSING, 'A harbour'));
    const en = await h.api('GET', `/api/books/${book.id}/export?format=txt`);
    expect(en.body).toContain('Before.\n\n[Image: A harbour]\n\nAfter.');
    const md = await h.api('GET', `/api/books/${book.id}/export?format=md`);
    expect(md.body).toContain('[Image: A harbour]');
  });
});

describe('GET /books/:id/assets (IMG-08)', () => {
  it('lists the book’s images newest first with the total size', async () => {
    const book = await h.createBook();
    const other = await h.createBook('Other');
    const a = await upload(book.id, 'a.png');
    const b = await upload(book.id, 'b.png');
    await upload(other.id, 'x.png');
    const pin = h.store.db.prepare('UPDATE assets SET created_at = ? WHERE id = ?');
    pin.run('2026-01-01T00:00:00.000Z', a.id);
    pin.run('2026-01-02T00:00:00.000Z', b.id);

    const res = await h.api('GET', `/api/books/${book.id}/assets`);
    expect(res.statusCode).toBe(200);
    const body = res.json<AssetListResponse>();
    expect(body.assets.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(body.assets[0]).toMatchObject({
      fileName: 'b.png',
      mime: 'image/png',
      bytes: TINY_PNG.length,
      url: `/assets/${book.id}/${b.id}`,
    });
    expect(body.totalBytes).toBe(TINY_PNG.length * 2);
  });

  it('is readable for a trashed book and 404 for an unknown one', async () => {
    const book = await h.createBook();
    await upload(book.id);
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api('GET', `/api/books/${book.id}/assets`);
    expect(res.statusCode).toBe(200);
    expect(res.json().assets).toHaveLength(1);
    expect((await h.api('GET', `/api/books/${MISSING}/assets`)).statusCode).toBe(404);
  });
});

describe('header images (IMG-20..22)', () => {
  it('sets, reads and removes a header image', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);

    expect((await h.api('GET', `/api/nodes/${node.id}`)).json().node).toMatchObject({
      headerAssetId: null,
      headerImageUrl: null,
    });
    const set = await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: image.id });
    expect(set.statusCode).toBe(200);
    expect((await h.api('GET', `/api/nodes/${node.id}`)).json().node).toMatchObject({
      headerAssetId: image.id,
      headerImageUrl: `/assets/${book.id}/${image.id}`,
    });

    const removed = await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: null });
    expect(removed.statusCode).toBe(200);
    expect((await h.api('GET', `/api/nodes/${node.id}`)).json().node.headerAssetId).toBeNull();
    // Nothing else used it, so the file is gone.
    expect(fileExists(book.id, image.id)).toBe(false);
  });

  it('refuses another book’s image and an unknown one with INVALID_IMAGE', async () => {
    const book = await h.createBook();
    const other = await h.createBook('Other');
    const node = await chapter(book.id);
    const foreign = await upload(other.id);
    for (const id of [foreign.id, MISSING]) {
      const res = await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: id });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_IMAGE');
    }
    expect((await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: 'x' })).statusCode).toBe(
      400,
    );
  });

  it('is 409 BOOK_TRASHED for a trashed book', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: image.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BOOK_TRASHED');
  });

  it('changes the other fields together with the header', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);
    const res = await h.api('PATCH', `/api/nodes/${node.id}`, {
      title: 'Renamed',
      headerAssetId: image.id,
    });
    expect(res.json().node.title).toBe('Renamed');
  });

  it('deletes a replaced header file only when nothing else uses it', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const next = await upload(book.id, 'next.png');
    const unused = await upload(book.id, 'unused.png');
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: unused.id });
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: next.id });
    expect(fileExists(book.id, unused.id)).toBe(false);
    expect(h.store.db.prepare('SELECT 1 FROM assets WHERE id = ?').get(unused.id)).toBeUndefined();
    expect(fileExists(book.id, next.id)).toBe(true);
  });

  it.each([
    ['live section text', async (id: string, node: string) => save(node, imageDoc(id))],
    [
      'trashed section text',
      async (id: string, node: string, bookId: string) => {
        const other = await h.createNode(bookId, 'chapter', null, 'Other');
        await save(other.id, imageDoc(id));
        await h.api('DELETE', `/api/nodes/${other.id}`);
      },
    ],
    [
      'a snapshot',
      async (id: string, node: string) => {
        h.store.db
          .prepare(
            `INSERT INTO snapshots (id, node_id, content, word_count, reason, created_at)
             VALUES (?, ?, ?, 0, 'interval', '2026-01-01T00:00:00.000Z')`,
          )
          .run(crypto.randomUUID(), node, JSON.stringify(imageDoc(id)));
      },
    ],
  ])('keeps a replaced header file that is used in %s', async (_name, use) => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const shared = await upload(book.id);
    const replacement = await upload(book.id, 'r.png');
    await use(shared.id, node.id, book.id);
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: shared.id });
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: replacement.id });
    expect(fileExists(book.id, shared.id)).toBe(true);
    expect(h.store.db.prepare('SELECT 1 FROM assets WHERE id = ?').get(shared.id)).toBeDefined();
  });

  it('keeps a header file that another section uses as its header', async () => {
    const book = await h.createBook();
    const a = await chapter(book.id, 'A');
    const b = await chapter(book.id, 'B');
    const image = await upload(book.id);
    await h.api('PATCH', `/api/nodes/${a.id}`, { headerAssetId: image.id });
    await h.api('PATCH', `/api/nodes/${b.id}`, { headerAssetId: image.id });
    await h.api('PATCH', `/api/nodes/${a.id}`, { headerAssetId: null });
    expect(fileExists(book.id, image.id)).toBe(true);
  });

  it('copies the header on duplicate and keeps it through trash and restore', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: image.id });

    const copy = (await h.api('POST', `/api/nodes/${node.id}/duplicate`, {})).json().node;
    expect((await h.api('GET', `/api/nodes/${copy.id}`)).json().node.headerAssetId).toBe(image.id);
    // Removing it from the original keeps the file: the copy still uses it.
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: null });
    expect(fileExists(book.id, image.id)).toBe(true);

    await h.api('DELETE', `/api/nodes/${copy.id}`);
    expect((await h.api('GET', `/api/nodes/${copy.id}`)).json().node.headerAssetId).toBe(image.id);
    await h.api('POST', `/api/nodes/${copy.id}/restore`);
    expect((await h.api('GET', `/api/nodes/${copy.id}`)).json().node.headerAssetId).toBe(image.id);
  });

  it('lets a book with header images be trashed and deleted permanently', async () => {
    const book = await h.createBook('Doomed');
    const node = await chapter(book.id);
    const image = await upload(book.id);
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: image.id });
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api('DELETE', `/api/books/${book.id}?purge=1&confirmTitle=Doomed`);
    expect(res.statusCode).toBe(204);
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 0 });
  });

  it('does not count the header image in the text, words or snapshots', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    await save(node.id, paragraphs('Two words'));
    const image = await upload(book.id);
    await h.api('PATCH', `/api/nodes/${node.id}`, { headerAssetId: image.id });
    const body = (await h.api('GET', `/api/nodes/${node.id}`)).json().node;
    expect(body.wordCount).toBe(2);
    expect(JSON.stringify(body.content)).not.toContain(image.id);
    const export_ = await h.api('GET', `/api/books/${book.id}/export?format=md`);
    expect(export_.body).not.toContain('Image');
  });

  it('survives the book’s other images being replaced: an image in text blocks cover deletion', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);
    await h.api('PATCH', `/api/books/${book.id}`, { coverAssetId: image.id });
    await save(node.id, imageDoc(image.id));
    await h.api('PATCH', `/api/books/${book.id}`, { coverAssetId: null });
    expect(fileExists(book.id, image.id)).toBe(true);
  });
});

describe('removing an image from the text deletes nothing (IMG-07)', () => {
  it('keeps the asset after the image leaves the text, so undo and snapshots still show it', async () => {
    const book = await h.createBook();
    const node = await chapter(book.id);
    const image = await upload(book.id);
    await save(node.id, imageDoc(image.id));
    await save(node.id, paragraphs('No image now.'));
    expect(fileExists(book.id, image.id)).toBe(true);
    expect((await h.api('GET', `/assets/${book.id}/${image.id}`)).statusCode).toBe(200);
  });
});

describe('POST /books/:id/assets/copy (IMG-10)', () => {
  it('copies an image of another book into this one', async () => {
    const one = await h.createBook('One');
    const two = await h.createBook('Two');
    const source = await upload(one.id, 'source.png');

    const res = await h.api('POST', `/api/books/${two.id}/assets/copy`, {
      sourceBookId: one.id,
      assetId: source.id,
    });
    expect(res.statusCode).toBe(201);
    const { asset } = res.json();
    expect(asset).toMatchObject({ bookId: two.id, fileName: 'source.png', mime: 'image/png' });
    expect(asset.id).not.toBe(source.id);
    expect(asset.url).toBe(`/assets/${two.id}/${asset.id}`);
    const served = await h.api('GET', asset.url);
    expect(served.rawPayload.equals(TINY_PNG)).toBe(true);
    expect(fileExists(one.id, source.id)).toBe(true);
  });

  it('refuses a wrong source book, an unknown asset, a trashed target and a bad body', async () => {
    const one = await h.createBook('One');
    const two = await h.createBook('Two');
    const source = await upload(one.id);
    const copy = (body: unknown, bookId = two.id) =>
      h.api('POST', `/api/books/${bookId}/assets/copy`, body);

    expect((await copy({ sourceBookId: two.id, assetId: source.id })).statusCode).toBe(404);
    expect((await copy({ sourceBookId: one.id, assetId: MISSING })).statusCode).toBe(404);
    expect((await copy({ sourceBookId: one.id })).statusCode).toBe(400);

    fs.rmSync(path.join(h.store.paths.assetsDir, one.id, `${source.id}.png`));
    expect((await copy({ sourceBookId: one.id, assetId: source.id })).statusCode).toBe(404);

    const again = await upload(one.id);
    await h.api('DELETE', `/api/books/${two.id}`);
    const trashed = await copy({ sourceBookId: one.id, assetId: again.id });
    expect(trashed.statusCode).toBe(409);
    expect(trashed.json().error.code).toBe('BOOK_TRASHED');
  });
});

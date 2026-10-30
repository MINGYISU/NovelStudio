import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Book } from '../shared/schemas/book.ts';
import { DEFAULT_DISPLAY } from '../shared/schemas/display.ts';
import { Harness, multipartBody, TINY_PNG } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function upload(bookId: string): Promise<string> {
  const form = multipartBody([{ name: 'file', filename: 'paper.png', data: TINY_PNG }]);
  const res = await h.app.inject({ method: 'POST', url: `/api/books/${bookId}/assets`, ...form });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

const display = (extra: object) => ({ ...DEFAULT_DISPLAY, ...extra });
const patch = (bookId: string, body: object) => h.api('PATCH', `/api/books/${bookId}`, body);
const get = async (bookId: string) => (await h.api('GET', `/api/books/${bookId}`)).json<Book>();
const assetFile = (bookId: string, assetId: string) =>
  path.join(h.store.paths.assetsDir, bookId, `${assetId}.png`);

describe('display settings (DISP-02)', () => {
  it('has calm defaults and accepts older stored settings without the new fields', async () => {
    const book = await h.createBook();
    expect((await get(book.id)).display).toMatchObject({
      theme: 'light',
      paragraphSpacing: 0.6,
      backgroundColor: null,
      backgroundImageAssetId: null,
      backgroundImageOpacity: 0.3,
    });
    h.store.db
      .prepare('UPDATE books SET settings = ? WHERE id = ?')
      .run(
        JSON.stringify({ display: { fontFamily: 'sans', fontSize: 20, theme: 'dark' } }),
        book.id,
      );
    expect((await get(book.id)).display).toMatchObject({
      fontFamily: 'sans',
      fontSize: 20,
      theme: 'dark',
      paragraphSpacing: 0.6,
      backgroundImageAssetId: null,
    });
  });

  it('shows images by default, reads older settings as on, and stores Show images off (IMG-12)', async () => {
    const book = await h.createBook();
    expect((await get(book.id)).display.showImages).toBe(true);
    h.store.db
      .prepare('UPDATE books SET settings = ? WHERE id = ?')
      .run(JSON.stringify({ display: { theme: 'dark' } }), book.id);
    expect((await get(book.id)).display.showImages).toBe(true);

    const res = await patch(book.id, { display: display({ showImages: false }) });
    expect(res.statusCode).toBe(200);
    expect((await get(book.id)).display.showImages).toBe(false);
    expect((await patch(book.id, { display: display({ showImages: 'no' }) })).statusCode).toBe(400);
  });

  it('stores sepia, paragraph spacing and a background color per book', async () => {
    const book = await h.createBook();
    const other = await h.createBook('Other');
    const res = await patch(book.id, {
      display: display({ theme: 'sepia', paragraphSpacing: 1.2, backgroundColor: '#f4ecd8' }),
    });
    expect(res.statusCode).toBe(200);
    await h.restart();
    expect((await get(book.id)).display).toMatchObject({
      theme: 'sepia',
      paragraphSpacing: 1.2,
      backgroundColor: '#f4ecd8',
    });
    expect((await get(other.id)).display.theme).toBe('light');
  });

  it('rejects values outside the allowed ranges', async () => {
    const book = await h.createBook();
    for (const bad of [
      { theme: 'neon' },
      { paragraphSpacing: 5 },
      { paragraphSpacing: -1 },
      { backgroundColor: 'red' },
      { backgroundColor: 'url(javascript:alert(1))' },
      { backgroundImageOpacity: 0 },
      { backgroundImageOpacity: 2 },
      { backgroundImageAssetId: 'not-a-uuid' },
    ]) {
      expect((await patch(book.id, { display: display(bad) })).statusCode).toBe(400);
    }
    expect((await get(book.id)).display).toEqual(DEFAULT_DISPLAY);
  });
});

describe('background image (DISP-02)', () => {
  it('uses an image uploaded to the book, keeps it through other edits, and survives a restart', async () => {
    const book = await h.createBook();
    const asset = await upload(book.id);
    const res = await patch(book.id, {
      display: display({ backgroundImageAssetId: asset, backgroundImageOpacity: 0.5 }),
    });
    expect(res.statusCode).toBe(200);
    await patch(book.id, { title: 'Renamed' });
    await h.restart();
    expect((await get(book.id)).display).toMatchObject({
      backgroundImageAssetId: asset,
      backgroundImageOpacity: 0.5,
    });
    expect((await h.api('GET', `/assets/${book.id}/${asset}`)).statusCode).toBe(200);
  });

  it('refuses unknown images and images of another book', async () => {
    const book = await h.createBook();
    const other = await h.createBook('Other');
    const foreign = await upload(other.id);
    for (const id of [foreign, '00000000-0000-4000-8000-000000000000']) {
      const res = await patch(book.id, { display: display({ backgroundImageAssetId: id }) });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_BACKGROUND');
    }
    expect((await get(book.id)).display.backgroundImageAssetId).toBeNull();
    expect(fs.existsSync(assetFile(other.id, foreign))).toBe(true);
  });

  it('deletes a replaced or removed background image file', async () => {
    const book = await h.createBook();
    const first = await upload(book.id);
    const second = await upload(book.id);
    await patch(book.id, { display: display({ backgroundImageAssetId: first }) });
    await patch(book.id, { display: display({ backgroundImageAssetId: second }) });
    expect(fs.existsSync(assetFile(book.id, first))).toBe(false);
    expect((await h.api('GET', `/assets/${book.id}/${first}`)).statusCode).toBe(404);
    expect(fs.existsSync(assetFile(book.id, second))).toBe(true);

    await patch(book.id, { display: display({ backgroundImageAssetId: null }) });
    expect(fs.existsSync(assetFile(book.id, second))).toBe(false);
  });

  it('keeps an image that something else still uses', async () => {
    const book = await h.createBook();
    const shared = await upload(book.id);
    await patch(book.id, { coverAssetId: shared });
    await patch(book.id, { display: display({ backgroundImageAssetId: shared }) });
    await patch(book.id, { display: display({ backgroundImageAssetId: null }) });
    expect(fs.existsSync(assetFile(book.id, shared))).toBe(true);
    expect((await get(book.id)).coverAssetId).toBe(shared);

    // And the cover is kept when it is replaced while the background still uses the image.
    await patch(book.id, { display: display({ backgroundImageAssetId: shared }) });
    await patch(book.id, { coverAssetId: null });
    expect(fs.existsSync(assetFile(book.id, shared))).toBe(true);
  });

  it('does not touch the image when the book is edited with the same background', async () => {
    const book = await h.createBook();
    const asset = await upload(book.id);
    const body = { display: display({ backgroundImageAssetId: asset }) };
    await patch(book.id, body);
    await patch(book.id, body);
    expect(fs.existsSync(assetFile(book.id, asset))).toBe(true);
  });
});

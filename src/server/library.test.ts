import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset, Book } from '../shared/schemas/book.ts';
import { buildApp } from './app.ts';
import { openDataStore, type DataStore } from './bootstrap.ts';
import { listBackups } from './services/hot-backup.ts';

const PORT = 4317;
const HOST = { host: `127.0.0.1:${PORT}` };

let tmp: string;
let dataDir: string;
let store: DataStore;
let app: FastifyInstance;

async function start(): Promise<void> {
  store = openDataStore({
    env: { NODE_ENV: 'test', NOVEL_DATA_DIR: dataDir },
    homedir: path.join(tmp, 'home'),
  });
  app = await buildApp({ port: PORT, production: false, db: store.db, paths: store.paths });
}

async function stop(): Promise<void> {
  await app.close();
  store.close();
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
  fs.mkdirSync(path.join(tmp, 'home'));
  dataDir = path.join(tmp, 'data');
  await start();
});

afterEach(async () => {
  await stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: HOST, payload: payload as object | undefined });
}

async function createBook(title: string, extra: object = {}): Promise<Book> {
  const res = await api('POST', '/api/books', { title, ...extra });
  expect(res.statusCode).toBe(201);
  return res.json<Book>();
}

async function list(query = ''): Promise<Book[]> {
  const res = await api('GET', `/api/books${query}`);
  expect(res.statusCode).toBe(200);
  return res.json<{ books: Book[] }>().books;
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake png body for tests'),
]);

function multipartBody(fileName: string, data: Buffer, contentType = 'image/png') {
  const boundary = '----novelstudio-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { ...HOST, 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function upload(bookId: string, fileName: string, data: Buffer, contentType?: string) {
  const { payload, headers } = multipartBody(fileName, data, contentType);
  return app.inject({ method: 'POST', url: `/api/books/${bookId}/assets`, headers, payload });
}

describe('create and list', () => {
  it('creates a book with defaults and lists it', async () => {
    const book = await createBook('  The Long Winter  ');
    expect(book).toMatchObject({
      title: 'The Long Winter',
      author: '',
      description: '',
      coverAssetId: null,
      coverUrl: null,
      wordCount: 0,
      deletedAt: null,
    });
    expect(book.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await list()).toEqual([book]);
    // CDX-01: the default Codex categories are created with the book.
    const res = await app.inject({
      method: 'GET',
      url: `/api/books/${book.id}/codex`,
      headers: HOST,
    });
    expect(res.json<{ categories: unknown[] }>().categories).toHaveLength(8);
  });

  it('accepts author and description', async () => {
    const book = await createBook('A', { author: 'Ann', description: 'Made-up story.' });
    expect(book).toMatchObject({ author: 'Ann', description: 'Made-up story.' });
  });

  it.each([
    [{}],
    [{ title: '' }],
    [{ title: '   ' }],
    [{ title: 'x'.repeat(201) }],
    [{ title: 'ok', author: 'x'.repeat(201) }],
    [{ title: 5 }],
  ])('rejects invalid body %j', async (body) => {
    const res = await api('POST', '/api/books', body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await list()).toEqual([]);
  });

  it('gets one book and 404s for unknown or malformed ids', async () => {
    const book = await createBook('One');
    const ok = await api('GET', `/api/books/${book.id}`);
    expect(ok.json()).toEqual(book);
    const missing = await api('GET', `/api/books/${crypto.randomUUID()}`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
    expect((await api('GET', '/api/books/not-a-uuid')).statusCode).toBe(400);
  });

  it('rejects an invalid sort', async () => {
    expect((await api('GET', '/api/books?sort=random')).statusCode).toBe(400);
  });
});

describe('sorting', () => {
  it('sorts by last modified (default) and by title', async () => {
    const a = await createBook('banana');
    const b = await createBook('Cherry');
    const c = await createBook('apple');
    const setUpdated = (id: string, at: string) =>
      store.db.prepare('UPDATE books SET updated_at = ? WHERE id = ?').run(at, id);
    setUpdated(a.id, '2026-01-02T00:00:00.000Z');
    setUpdated(b.id, '2026-01-03T00:00:00.000Z');
    setUpdated(c.id, '2026-01-01T00:00:00.000Z');

    expect((await list()).map((x) => x.title)).toEqual(['Cherry', 'banana', 'apple']);
    expect((await list('?sort=modified')).map((x) => x.title)).toEqual([
      'Cherry',
      'banana',
      'apple',
    ]);
    expect((await list('?sort=title')).map((x) => x.title)).toEqual(['apple', 'banana', 'Cherry']);
  });
});

describe('edit metadata', () => {
  it('updates fields and bumps updatedAt', async () => {
    const book = await createBook('Old');
    store.db
      .prepare('UPDATE books SET updated_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', book.id);
    const res = await api('PATCH', `/api/books/${book.id}`, {
      title: 'New',
      author: 'Zed',
      description: 'Desc',
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json<Book>();
    expect(updated).toMatchObject({ title: 'New', author: 'Zed', description: 'Desc' });
    expect(updated.updatedAt > '2020-01-01T00:00:00.000Z').toBe(true);
  });

  it('keeps unspecified fields', async () => {
    const book = await createBook('T', { author: 'A' });
    const res = await api('PATCH', `/api/books/${book.id}`, { description: 'D' });
    expect(res.json()).toMatchObject({ title: 'T', author: 'A', description: 'D' });
  });

  it.each([[{}], [{ title: '' }], [{ coverAssetId: 'nope' }]])(
    'rejects invalid patch %j',
    async (body) => {
      const book = await createBook('T');
      const res = await api('PATCH', `/api/books/${book.id}`, body);
      expect(res.statusCode).toBe(400);
    },
  );

  it('404s for an unknown book and 409s for a trashed one', async () => {
    expect(
      (await api('PATCH', `/api/books/${crypto.randomUUID()}`, { title: 'x' })).statusCode,
    ).toBe(404);
    const book = await createBook('T');
    await api('DELETE', `/api/books/${book.id}`);
    const res = await api('PATCH', `/api/books/${book.id}`, { title: 'x' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BOOK_TRASHED');
  });
});

describe('trash, restore, purge', () => {
  it('moves a book to the trash and back without touching updatedAt', async () => {
    const keep = await createBook('Keep');
    const book = await createBook('Trash me');

    const trashed = await api('DELETE', `/api/books/${book.id}`);
    expect(trashed.statusCode).toBe(200);
    expect(trashed.json<Book>().deletedAt).not.toBeNull();
    expect(trashed.json<Book>().updatedAt).toBe(book.updatedAt);
    expect((await list()).map((b) => b.id)).toEqual([keep.id]);
    expect((await list('?trashed=1')).map((b) => b.id)).toEqual([book.id]);

    const restored = await api('POST', `/api/books/${book.id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json<Book>().deletedAt).toBeNull();
    expect(await list('?trashed=1')).toEqual([]);
    expect((await list()).map((b) => b.id).sort()).toEqual([keep.id, book.id].sort());
  });

  it('refuses invalid state transitions', async () => {
    const book = await createBook('T');
    const restoreLive = await api('POST', `/api/books/${book.id}/restore`);
    expect(restoreLive.statusCode).toBe(409);
    expect(restoreLive.json().error.code).toBe('BOOK_NOT_TRASHED');

    await api('DELETE', `/api/books/${book.id}`);
    expect((await api('DELETE', `/api/books/${book.id}`)).statusCode).toBe(409);

    const missing = crypto.randomUUID();
    expect((await api('DELETE', `/api/books/${missing}`)).statusCode).toBe(404);
    expect((await api('POST', `/api/books/${missing}/restore`)).statusCode).toBe(404);
  });

  describe('purge', () => {
    const purge = (id: string, title?: string) =>
      api(
        'DELETE',
        `/api/books/${id}?purge=1${title === undefined ? '' : `&confirmTitle=${encodeURIComponent(title)}`}`,
      );

    it('requires the exact title', async () => {
      const book = await createBook('My Novel');
      await api('DELETE', `/api/books/${book.id}`);

      for (const wrong of [undefined, '', 'my novel', 'My Novel ', 'My', 'Other']) {
        const res = await purge(book.id, wrong);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('CONFIRM_TITLE_MISMATCH');
      }
      expect((await list('?trashed=1')).map((b) => b.id)).toEqual([book.id]);

      const ok = await purge(book.id, 'My Novel');
      expect(ok.statusCode).toBe(204);
      expect(await list('?trashed=1')).toEqual([]);
      expect((await api('GET', `/api/books/${book.id}`)).statusCode).toBe(404);
    });

    it('works with CJK and special characters in the title', async () => {
      const book = await createBook('重逢 & 离别 #1?');
      await api('DELETE', `/api/books/${book.id}`);
      expect((await purge(book.id, '重逢 & 离别 #1?')).statusCode).toBe(204);
    });

    it('refuses to purge a book that is not in the trash', async () => {
      const book = await createBook('Live');
      const res = await purge(book.id, 'Live');
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('BOOK_NOT_TRASHED');
      expect(await list()).toHaveLength(1);
    });

    it('404s for an unknown book', async () => {
      expect((await purge(crypto.randomUUID(), 'x')).statusCode).toBe(404);
    });

    it('takes a hot backup first and removes rows and asset files', async () => {
      const book = await createBook('Gone');
      const other = await createBook('Stays');
      const up = await upload(book.id, 'c.png', PNG);
      expect(up.statusCode).toBe(201);
      await api('PATCH', `/api/books/${book.id}`, { coverAssetId: up.json<Asset>().id });
      const otherUp = await upload(other.id, 'c.png', PNG);
      expect(otherUp.statusCode).toBe(201);

      const now = new Date().toISOString();
      const insertNode = store.db.prepare(
        `INSERT INTO nodes (id, book_id, parent_id, kind, position, created_at, updated_at)
         VALUES (?, ?, ?, 'chapter', 0, ?, ?)`,
      );
      insertNode.run('n1', book.id, null, now, now);
      insertNode.run('n2', book.id, 'n1', now, now);

      await api('DELETE', `/api/books/${book.id}`);
      const backupsBefore = listBackups(store.paths.backupsDir).length;
      expect((await purge(book.id, 'Gone')).statusCode).toBe(204);

      expect(listBackups(store.paths.backupsDir).length).toBeGreaterThan(backupsBefore);
      expect(store.db.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 0 });
      expect(
        store.db.prepare('SELECT COUNT(*) AS n FROM assets WHERE book_id = ?').get(book.id),
      ).toEqual({ n: 0 });
      expect(fs.existsSync(path.join(store.paths.assetsDir, book.id))).toBe(false);
      expect(fs.existsSync(path.join(store.paths.assetsDir, other.id))).toBe(true);
      expect((await list()).map((b) => b.id)).toEqual([other.id]);
    });

    it('does not delete anything when the hot backup fails', async () => {
      const book = await createBook('Keep me');
      await api('DELETE', `/api/books/${book.id}`);
      fs.rmSync(store.paths.backupsDir, { recursive: true, force: true });
      fs.writeFileSync(store.paths.backupsDir, 'not a directory');

      const res = await purge(book.id, 'Keep me');
      expect(res.statusCode).toBe(500);
      expect((await list('?trashed=1')).map((b) => b.id)).toEqual([book.id]);
    });
  });
});

describe('word count', () => {
  it('sums live sections and ignores trashed subtrees', async () => {
    const book = await createBook('Counted');
    const now = new Date().toISOString();
    const insert = store.db.prepare(
      `INSERT INTO nodes (id, book_id, parent_id, kind, position, word_count, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    );
    insert.run('a', book.id, null, 'part', 100, null, now, now);
    insert.run('b', book.id, 'a', 'chapter', 50, null, now, now);
    insert.run('c', book.id, null, 'chapter', 7, now, now, now);
    insert.run('d', book.id, 'c', 'scene', 1000, null, now, now);
    expect((await list())[0]?.wordCount).toBe(150);
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().wordCount).toBe(150);
  });
});

describe('persistence', () => {
  it('two books and their trash state survive a restart', async () => {
    const one = await createBook('First', { author: 'A' });
    const two = await createBook('Second');
    const three = await createBook('Third');
    await api('DELETE', `/api/books/${three.id}`);

    await stop();
    await start();

    const live = await list('?sort=title');
    expect(live.map((b) => b.title)).toEqual(['First', 'Second']);
    expect(live[0]).toMatchObject({ id: one.id, author: 'A' });
    expect(live[1]?.id).toBe(two.id);
    expect((await list('?trashed=1')).map((b) => b.id)).toEqual([three.id]);
  });
});

describe('cover upload', () => {
  it('stores a PNG, serves it with safe headers and sets it as the cover', async () => {
    const book = await createBook('Covered');
    const res = await upload(book.id, 'cover.png', PNG);
    expect(res.statusCode).toBe(201);
    const asset = res.json<Asset>();
    expect(asset).toMatchObject({ bookId: book.id, mime: 'image/png', fileName: 'cover.png' });
    expect(asset.url).toBe(`/assets/${book.id}/${asset.id}`);

    const patched = await api('PATCH', `/api/books/${book.id}`, { coverAssetId: asset.id });
    expect(patched.json<Book>()).toMatchObject({ coverAssetId: asset.id, coverUrl: asset.url });

    const served = await app.inject({ method: 'GET', url: asset.url, headers: HOST });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toBe("default-src 'none'");
    expect(Buffer.compare(served.rawPayload, PNG)).toBe(0);
  });

  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'image/jpeg'],
    ['image/gif', Buffer.from('GIF89a-rest'), 'image/gif'],
    ['image/gif', Buffer.from('GIF87a-rest'), 'image/gif'],
    [
      'image/webp',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
      'image/webp',
    ],
  ])('accepts %s by its magic bytes', async (_label, data, mime) => {
    const book = await createBook('T');
    const res = await upload(book.id, 'whatever.bin', data, 'application/octet-stream');
    expect(res.statusCode).toBe(201);
    expect(res.json<Asset>().mime).toBe(mime);
  });

  it('judges by content, not by name: a PNG named .txt is fine', async () => {
    const book = await createBook('T');
    expect((await upload(book.id, 'cover.txt', PNG, 'text/plain')).statusCode).toBe(201);
  });

  it('rejects an SVG, even with an image MIME type and a .png name', async () => {
    const book = await createBook('T');
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    for (const [name, type] of [
      ['cover.svg', 'image/svg+xml'],
      ['cover.png', 'image/png'],
    ] as const) {
      const res = await upload(book.id, name, svg, type);
      expect(res.statusCode).toBe(415);
      expect(res.json().error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
    }
  });

  it('rejects a text file renamed to .png/.jpg', async () => {
    const book = await createBook('T');
    for (const name of ['notes.png', 'notes.jpg', 'notes.txt']) {
      const res = await upload(book.id, name, Buffer.from('just some text'), 'image/png');
      expect(res.statusCode).toBe(415);
    }
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(store.paths.assetsDir, book.id))).toBe(false);
  });

  it('rejects an empty file and a missing file', async () => {
    const book = await createBook('T');
    expect((await upload(book.id, 'empty.png', Buffer.alloc(0))).statusCode).toBe(415);
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${book.id}/assets`,
      headers: HOST,
      payload: { not: 'multipart' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects files over 20 MB', async () => {
    const book = await createBook('T');
    const big = Buffer.concat([PNG, Buffer.alloc(20 * 1024 * 1024)]);
    const res = await upload(book.id, 'big.png', big);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
  });

  it('404s for an unknown book and 409s for a trashed one', async () => {
    expect((await upload(crypto.randomUUID(), 'c.png', PNG)).statusCode).toBe(404);
    const book = await createBook('T');
    await api('DELETE', `/api/books/${book.id}`);
    expect((await upload(book.id, 'c.png', PNG)).statusCode).toBe(409);
  });

  it('never uses the client file name on disk', async () => {
    const book = await createBook('T');
    const res = await upload(book.id, '../../evil.png', PNG);
    expect(res.statusCode).toBe(201);
    const asset = res.json<Asset>();
    expect(asset.fileName).toBe('evil.png');
    expect(fs.readdirSync(path.join(store.paths.assetsDir, book.id))).toEqual([`${asset.id}.png`]);
    expect(fs.existsSync(path.join(dataDir, '..', 'evil.png'))).toBe(false);
  });

  it('replacing or removing the cover deletes the old asset', async () => {
    const book = await createBook('T');
    const first = (await upload(book.id, 'a.png', PNG)).json<Asset>();
    await api('PATCH', `/api/books/${book.id}`, { coverAssetId: first.id });
    const second = (await upload(book.id, 'b.png', PNG)).json<Asset>();
    await api('PATCH', `/api/books/${book.id}`, { coverAssetId: second.id });

    const dir = path.join(store.paths.assetsDir, book.id);
    expect(fs.readdirSync(dir)).toEqual([`${second.id}.png`]);
    expect((await app.inject({ method: 'GET', url: first.url, headers: HOST })).statusCode).toBe(
      404,
    );

    const removed = await api('PATCH', `/api/books/${book.id}`, { coverAssetId: null });
    expect(removed.json<Book>()).toMatchObject({ coverAssetId: null, coverUrl: null });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a cover from another book or an unknown asset', async () => {
    const a = await createBook('A');
    const b = await createBook('B');
    const foreign = (await upload(b.id, 'x.png', PNG)).json<Asset>();
    for (const id of [foreign.id, crypto.randomUUID()]) {
      const res = await api('PATCH', `/api/books/${a.id}`, { coverAssetId: id });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_COVER');
    }
    expect((await api('GET', `/api/books/${a.id}`)).json<Book>().coverAssetId).toBeNull();
  });

  it('serves nothing for a wrong book id, unknown asset or malformed ids', async () => {
    const a = await createBook('A');
    const b = await createBook('B');
    const asset = (await upload(a.id, 'x.png', PNG)).json<Asset>();
    const get = (url: string) => app.inject({ method: 'GET', url, headers: HOST });
    expect((await get(`/assets/${b.id}/${asset.id}`)).statusCode).toBe(404);
    expect((await get(`/assets/${a.id}/${crypto.randomUUID()}`)).statusCode).toBe(404);
    expect((await get(`/assets/${a.id}/..%2F..%2Fnovelstudio.db`)).statusCode).toBe(400);
    expect((await get(`/assets/..%2F/${asset.id}`)).statusCode).toBe(400);
  });

  it('a trashed book keeps its cover for the trash view', async () => {
    const book = await createBook('T');
    const asset = (await upload(book.id, 'x.png', PNG)).json<Asset>();
    await api('PATCH', `/api/books/${book.id}`, { coverAssetId: asset.id });
    await api('DELETE', `/api/books/${book.id}`);
    expect((await app.inject({ method: 'GET', url: asset.url, headers: HOST })).statusCode).toBe(
      200,
    );
    expect((await list('?trashed=1'))[0]?.coverUrl).toBe(asset.url);
  });
});

describe('request security on library routes', () => {
  it('rejects a foreign Host and a foreign Origin on writes', async () => {
    const hostRes = await app.inject({
      method: 'GET',
      url: '/api/books',
      headers: { host: 'evil.com' },
    });
    expect(hostRes.statusCode).toBe(403);

    const originRes = await app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { ...HOST, origin: 'http://evil.com' },
      payload: { title: 'x' },
    });
    expect(originRes.statusCode).toBe(403);
    expect(await list()).toEqual([]);
  });

  it('returns JSON errors for malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { ...HOST, 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });
});

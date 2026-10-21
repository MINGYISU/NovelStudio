import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHINESE_STRUCTURE } from '../shared/schemas/structure.ts';
import { Harness, paragraphs } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function save(nodeId: string, texts: string[]) {
  const res = await h.saveContent(nodeId, paragraphs(...texts), 0);
  expect(res.statusCode).toBe(200);
}

async function build() {
  const book = await h.createBook('The Lantern Road');
  await h.api('PATCH', `/api/books/${book.id}`, { author: 'Made Up' });
  const volume = await h.createNode(book.id, 'volume', null, 'Old Roads');
  const ch1 = await h.createNode(book.id, 'chapter', volume.id, 'Reunion');
  const ch2 = await h.createNode(book.id, 'chapter', volume.id, 'Rain');
  const prologue = await h.createNode(book.id, 'chapter', null, 'Epilogue', { numbered: false });
  const cut = await h.createNode(book.id, 'chapter', null, 'Cut');
  const cutChild = await h.createNode(book.id, 'scene', cut.id, 'Cut scene');
  await save(ch1.id, ['First paragraph.', 'Second paragraph.']);
  await save(ch2.id, ['Rain fell.']);
  await save(prologue.id, ['The end.']);
  await save(cut.id, ['Trashed words.']);
  await save(cutChild.id, ['Trashed scene words.']);
  await h.api('DELETE', `/api/nodes/${cut.id}`);
  return { book, volume, ch1, ch2 };
}

describe('GET /api/books/:id/export (EXP-01)', () => {
  it('exports Markdown in reading order with display titles, without trashed sections', async () => {
    const { book } = await build();
    const res = await h.api('GET', `/api/books/${book.id}/export?format=md`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['content-disposition']).toContain(
      'attachment; filename="The-Lantern-Road.md"',
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    const md = res.body;
    expect(md.startsWith('# The Lantern Road\n\n*Made Up*')).toBe(true);
    const order = [
      '## Volume I — Old Roads',
      '### Chapter 1 — Reunion',
      'First paragraph.\n\nSecond paragraph.',
      '### Chapter 2 — Rain',
      'Rain fell.',
      '## Epilogue',
      'The end.',
    ].map((s) => md.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md).not.toContain('Cut');
    expect(md).not.toContain('Trashed');
  });

  it('exports plain text', async () => {
    const { book } = await build();
    const res = await h.api('GET', `/api/books/${book.id}/export?format=txt`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.body).toContain('Chapter 1 — Reunion\n\nFirst paragraph.\n\nSecond paragraph.');
    expect(res.body).not.toContain('**');
    expect(res.body).not.toContain('Trashed');
  });

  it('follows a move: the exported order and numbers change with the tree', async () => {
    const { book, volume, ch2 } = await build();
    await h.api('POST', `/api/nodes/${ch2.id}/move`, { parentId: volume.id, index: 0 });
    const md = (await h.api('GET', `/api/books/${book.id}/export?format=md`)).body;
    expect(md.indexOf('Chapter 1 — Rain')).toBeLessThan(md.indexOf('Chapter 2 — Reunion'));
  });

  it('uses the book structure and a safe, encoded file name for Chinese titles', async () => {
    const book = await h.createBook('夜雨集');
    await h.api('PATCH', `/api/books/${book.id}`, { structure: CHINESE_STRUCTURE });
    const ch = await h.createNode(book.id, 'chapter', null, '重逢');
    await save(ch.id, ['她没有抬头。']);
    const res = await h.api('GET', `/api/books/${book.id}/export?format=txt`);
    expect(res.body).toContain('第一章 重逢\n\n她没有抬头。');
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent('夜雨集.txt')}`);
    expect(/^[\x20-\x7e]*$/.test(disposition)).toBe(true);
  });

  it('validates the format, 404s for unknown books and also works for a trashed book', async () => {
    const { book } = await build();
    expect((await h.api('GET', `/api/books/${book.id}/export?format=docx`)).statusCode).toBe(400);
    expect((await h.api('GET', `/api/books/${book.id}/export`)).statusCode).toBe(400);
    expect(
      (await h.api('GET', '/api/books/00000000-0000-4000-8000-000000000000/export?format=md'))
        .statusCode,
    ).toBe(404);
    await h.api('DELETE', `/api/books/${book.id}`);
    expect((await h.api('GET', `/api/books/${book.id}/export?format=md`)).statusCode).toBe(200);
  });

  it('does not change anything', async () => {
    const { book } = await build();
    const sql = 'SELECT COUNT(*) AS n, MAX(updated_at) AS u FROM books';
    const before = h.store.db.prepare(sql).get();
    await h.api('GET', `/api/books/${book.id}/export?format=md`);
    expect(h.store.db.prepare(sql).get()).toEqual(before);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Book } from '../shared/schemas/book.ts';
import type { ImportPreviewResponse, ImportTextCommitResponse } from '../shared/schemas/import.ts';
import { MAX_TEXT_IMPORT_BYTES } from '../shared/schemas/import.ts';
import { CHINESE_STRUCTURE } from '../shared/schemas/structure.ts';
import { assertTreeInvariants } from '../shared/tree.ts';
import type { TreeNode } from '../shared/types.ts';
import { Harness, multipartBody } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

const chinese = [
  '第一章 重逢',
  '他回来了。',
  '第二章 雨夜',
  '雨下了一夜。',
  '第三章 离别',
  '再见。',
  '第四章 归来',
  '又见面了。',
  '第五章 尾声',
  '结束。',
].join('\n');

function upload(fileName: string, data: Buffer | string, fields: Record<string, string> = {}) {
  const form = multipartBody([
    ...Object.entries(fields).map(([name, value]) => ({ name, data: value })),
    { name: 'file', filename: fileName, data },
  ]);
  return h.app.inject({ method: 'POST', url: '/api/import/text', ...form });
}

const books = async () => (await h.api('GET', '/api/books')).json<{ books: Book[] }>().books;
const tree = async (bookId: string) =>
  (await h.api('GET', `/api/books/${bookId}/tree`)).json<{ nodes: TreeNode[] }>().nodes;

describe('POST /api/import/text: preview (IMP-02, PRD scenario 15)', () => {
  it('previews five detected chapters and writes nothing', async () => {
    const res = await upload('novel.txt', chinese, { mode: 'preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json<ImportPreviewResponse>();
    expect(body.detected).toBe(true);
    expect(body.encoding).toBe('UTF-8');
    expect(body.suggestedPreset).toBe('chinese');
    expect(body.sections.map((s) => s.title)).toEqual(['重逢', '雨夜', '离别', '归来', '尾声']);
    expect(body.sections.every((s) => s.kind === 'chapter')).toBe(true);
    expect(body.totalWords).toBeGreaterThan(0);
    expect(await books()).toHaveLength(0);
  });

  it('turns detection off into a single section', async () => {
    const res = await upload('novel.txt', chinese, { mode: 'preview', detect: '0' });
    const body = res.json<ImportPreviewResponse>();
    expect(body.detected).toBe(false);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]?.title).toBe('novel');
  });

  it('reads GB18030 files and reports the encoding', async () => {
    const res = await upload(
      'gbk.txt',
      Buffer.from([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xc4, 0xe3]),
      {
        mode: 'preview',
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json<ImportPreviewResponse>().encoding).toBe('GB18030');
  });

  it('only understands Markdown headings in .md files', async () => {
    const text = '# One\nA\n# Two\nB';
    expect(
      (await upload('a.md', text, { mode: 'preview' })).json<ImportPreviewResponse>().sections,
    ).toHaveLength(2);
    expect(
      (await upload('a.txt', text, { mode: 'preview' })).json<ImportPreviewResponse>().sections,
    ).toHaveLength(1);
  });

  it('rejects binary files, empty files and bad fields', async () => {
    const binary = await upload('x.txt', Buffer.from([0x50, 0x4b, 0x00, 0x01]), {
      mode: 'preview',
    });
    expect(binary.statusCode).toBe(415);
    expect(binary.json().error.code).toBe('IMPORT_NOT_TEXT');
    const empty = await upload('x.txt', '  \n\n', { mode: 'preview' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('IMPORT_EMPTY');
    expect((await upload('x.txt', 'hi', {})).statusCode).toBe(400);
    expect((await upload('x.txt', 'hi', { mode: 'nope' })).statusCode).toBe(400);
    const notMultipart = await h.api('POST', '/api/import/text', { mode: 'preview' });
    expect(notMultipart.statusCode).toBe(400);
  });

  it('refuses a file over the size cap with a clear message and imports nothing', async () => {
    const big = Buffer.alloc(MAX_TEXT_IMPORT_BYTES + 1, 0x61);
    const res = await upload('big.txt', big, { mode: 'commit' });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
    expect(res.json().error.message).toContain('25 MB');
    expect(await books()).toHaveLength(0);
  });

  it('refuses a file that splits into an absurd number of sections', async () => {
    const many = Array.from({ length: 3001 }, (_, i) => `Chapter ${i + 1}\nx`).join('\n');
    const res = await upload('many.txt', many, { mode: 'commit' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IMPORT_TOO_MANY_SECTIONS');
    expect(await books()).toHaveLength(0);
  });
});

describe('POST /api/import/text: commit (IMP-02/03)', () => {
  it('creates a book with five chapters, text intact, Chinese numbering and valid tree', async () => {
    const res = await upload('夜雨集.txt', chinese, { mode: 'commit' });
    expect(res.statusCode).toBe(201);
    const body = res.json<ImportTextCommitResponse>();
    expect(body.sectionCount).toBe(5);
    expect(body.book.title).toBe('夜雨集');
    expect(body.book.structure).toEqual(CHINESE_STRUCTURE);
    expect(body.book.wordCount).toBeGreaterThan(0);

    const nodes = await tree(body.book.id);
    assertTreeInvariants(nodes);
    expect(nodes.map((n) => [n.title, n.position, n.numbered])).toEqual([
      ['重逢', 0, true],
      ['雨夜', 1, true],
      ['离别', 2, true],
      ['归来', 3, true],
      ['尾声', 4, true],
    ]);
    const first = (await h.api('GET', `/api/nodes/${nodes[0]!.id}`)).json();
    expect(JSON.stringify(first.node.content)).toContain('他回来了。');

    // The book survives a restart.
    await h.restart();
    expect(await books()).toHaveLength(1);
    expect(await tree(body.book.id)).toHaveLength(5);
  });

  it('nests chapters under volumes, makes front matter unnumbered and honors title and preset', async () => {
    const text = '序言\n第一卷 起\n第一章 甲\na\n第二章 乙\nb\n第二卷 承\n第三章 丙\nc';
    const res = await upload('book.txt', text, {
      mode: 'commit',
      title: 'My Title',
      preset: 'english',
    });
    const body = res.json<ImportTextCommitResponse>();
    expect(body.book.title).toBe('My Title');
    expect(body.book.structure.chapter.format).toBe('Chapter {n}');

    const nodes = await tree(body.book.id);
    assertTreeInvariants(nodes);
    const byTitle = (t: string) => nodes.find((n) => n.title === t)!;
    expect(byTitle('Front matter')).toMatchObject({
      kind: 'chapter',
      numbered: false,
      parentId: null,
    });
    expect(byTitle('起')).toMatchObject({ kind: 'volume', parentId: null });
    expect(byTitle('甲').parentId).toBe(byTitle('起').id);
    expect(byTitle('乙').parentId).toBe(byTitle('起').id);
    expect(byTitle('丙').parentId).toBe(byTitle('承').id);
    expect(byTitle('乙').position).toBe(1);
  });

  it('imports Markdown with converted emphasis', async () => {
    const res = await upload('draft.md', '# One\nA **bold** move.\n# Two\nDone.', {
      mode: 'commit',
    });
    expect(res.statusCode).toBe(201);
    const { book } = res.json<ImportTextCommitResponse>();
    expect(book.structure.chapter.format).toBe('Chapter {n}');
    const nodes = await tree(book.id);
    const node = (await h.api('GET', `/api/nodes/${nodes[0]!.id}`)).json().node;
    expect(JSON.stringify(node.content)).toContain('"marks":[{"type":"bold"}]');
  });

  it('imports one section when detection is off', async () => {
    const res = await upload('flat.txt', chinese, { mode: 'commit', detect: '0' });
    const { book, sectionCount } = res.json<ImportTextCommitResponse>();
    expect(sectionCount).toBe(1);
    expect((await tree(book.id))[0]?.title).toBe('flat');
  });

  it('a failed import changes nothing (IMP-03)', async () => {
    const original = h.store.db.prepare.bind(h.store.db);
    let inserts = 0;
    h.store.db.prepare = ((sql: string) => {
      const stmt = original(sql);
      if (sql.includes('INSERT INTO nodes')) {
        const run = stmt.run.bind(stmt);
        stmt.run = ((...args: unknown[]) => {
          inserts += 1;
          if (inserts === 3) throw new Error('disk full');
          return run(...args);
        }) as typeof stmt.run;
      }
      return stmt;
    }) as typeof h.store.db.prepare;

    const res = await upload('novel.txt', chinese, { mode: 'commit' });
    h.store.db.prepare = original as typeof h.store.db.prepare;
    expect(res.statusCode).toBe(500);
    expect(await books()).toHaveLength(0);
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 0 });
  });
});

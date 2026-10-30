import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultCategories } from '../shared/seed-text.ts';
import { isCharacterCategory } from '../shared/codex.ts';
import { computeDisplayTitles } from '../shared/numbering.ts';
import type { Book } from '../shared/schemas/book.ts';
import type { CodexCategory } from '../shared/schemas/codex.ts';
import type { StoryMap } from '../shared/schemas/map.ts';
import type { ImportPreviewResponse, ImportTextCommitResponse } from '../shared/schemas/import.ts';
import { CHINESE_STRUCTURE, DEFAULT_STRUCTURE } from '../shared/schemas/structure.ts';
import type { TreeNode } from '../shared/types.ts';
import { ColdBackupService } from './services/cold-backup.ts';
import { restoreColdBackup } from './services/cold-backup-restore.ts';
import { Harness, multipartBody } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

const categoriesOf = async (bookId: string) =>
  (await h.api('GET', `/api/books/${bookId}/codex`)).json<{ categories: CodexCategory[] }>()
    .categories;
const treeOf = async (bookId: string) =>
  (await h.api('GET', `/api/books/${bookId}/tree`)).json<{ nodes: TreeNode[] }>().nodes;

describe('POST /api/books with a locale (I18N-06)', () => {
  it('creates the Chinese Codex categories and the Chinese numbering preset', async () => {
    const res = await h.api('POST', '/api/books', { title: '夜雨集', locale: 'zh-CN' });
    expect(res.statusCode).toBe(201);
    const book = res.json<Book>();
    expect(book.structure).toEqual(CHINESE_STRUCTURE);

    const categories = await categoriesOf(book.id);
    expect(categories.map((c) => c.name)).toEqual(defaultCategories('zh-CN').map((c) => c.name));
    expect(categories.map((c) => c.name)[0]).toBe('人物');
    expect(categories[0]!.fieldTemplate.map((f) => f.label)).toContain('目标与动机');

    const chapter = await h.createNode(book.id, 'chapter', null, '');
    const nodes = await treeOf(book.id);
    expect(computeDisplayTitles(nodes, book.structure).get(chapter.id)).toBe('第一章');
  });

  it('keeps the same field keys as the English categories', async () => {
    const zh = await categoriesOf(
      (await h.api('POST', '/api/books', { title: 'A', locale: 'zh-CN' })).json<Book>().id,
    );
    const en = await categoriesOf(
      (await h.api('POST', '/api/books', { title: 'B', locale: 'en' })).json<Book>().id,
    );
    expect(zh.map((c) => c.fieldTemplate.map((f) => f.key))).toEqual(
      en.map((c) => c.fieldTemplate.map((f) => f.key)),
    );
  });

  it('gives the same result as today without a locale', async () => {
    const book = await h.createBook('Plain');
    expect(book.structure).toEqual(DEFAULT_STRUCTURE);
    const categories = await categoriesOf(book.id);
    expect(categories.map((c) => c.name)).toEqual(defaultCategories('en').map((c) => c.name));
    expect(categories[0]!.name).toBe('Characters');
  });

  it('rejects an invalid locale', async () => {
    const res = await h.api('POST', '/api/books', { title: 'X', locale: 'fr' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('detects a Chinese default character category as the characters category (CDX-07)', () => {
    const [characters, locations] = defaultCategories('zh-CN');
    expect(isCharacterCategory(characters!)).toBe(true);
    expect(isCharacterCategory(locations!)).toBe(false);
  });
});

describe('POST /api/books/:id/codex/seed with a locale (I18N-06)', () => {
  async function emptyCodexBook() {
    const book = await h.createBook('Seeded');
    for (const category of await categoriesOf(book.id)) {
      expect((await h.api('DELETE', `/api/codex/categories/${category.id}`)).statusCode).toBe(200);
    }
    return book;
  }

  it('creates the defaults in the requested language', async () => {
    const book = await emptyCodexBook();
    const res = await h.api('POST', `/api/books/${book.id}/codex/seed`, { locale: 'zh-CN' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ categories: CodexCategory[] }>().categories.map((c) => c.name)).toEqual(
      defaultCategories('zh-CN').map((c) => c.name),
    );
  });

  it('defaults to English without a body and rejects an invalid locale', async () => {
    const book = await emptyCodexBook();
    const bad = await h.api('POST', `/api/books/${book.id}/codex/seed`, { locale: 'xx' });
    expect(bad.statusCode).toBe(400);
    const res = await h.api('POST', `/api/books/${book.id}/codex/seed`);
    expect(res.json<{ categories: CodexCategory[] }>().categories[0]!.name).toBe('Characters');
  });
});

describe('story maps with a locale (I18N-06)', () => {
  const create = async (bookId: string, body: object) => {
    const res = await h.api('POST', `/api/books/${bookId}/maps`, body);
    expect(res.statusCode).toBe(201);
    return res.json<{ map: StoryMap }>().map;
  };

  it('writes template titles and node titles in the requested language', async () => {
    const book = await h.createBook();
    const zh = await create(book.id, { template: 'timeline', locale: 'zh-CN' });
    expect(zh.title).toBe('时间线');
    expect(zh.data.nodes.map((n) => n.data.title)).toEqual(['开端', '发展', '转折点', '结局']);
    const blank = await create(book.id, { template: 'blank', locale: 'zh-CN' });
    expect(blank.title).toBe('未命名故事图');
    const arc = await create(book.id, { template: 'character-arc', locale: 'zh-CN' });
    expect(arc.data.nodes[0]!.data.description).toBe('故事开始时的样子。');
  });

  it('keeps English without a locale and never overrides a typed title', async () => {
    const book = await h.createBook();
    const en = await create(book.id, { template: 'plot-tree' });
    expect(en.title).toBe('Plot tree');
    expect(en.data.nodes[0]!.data.title).toBe('Premise');
    const typed = await create(book.id, { template: 'timeline', title: 'Mine', locale: 'zh-CN' });
    expect(typed.title).toBe('Mine');
  });

  it('rejects an invalid locale', async () => {
    const book = await h.createBook();
    const res = await h.api('POST', `/api/books/${book.id}/maps`, {
      template: 'blank',
      locale: 'x',
    });
    expect(res.statusCode).toBe(400);
  });

  it('adds the copy suffix of the requested language when duplicating', async () => {
    const book = await h.createBook();
    const map = await create(book.id, { template: 'blank', title: 'Atlas' });
    const en = await h.api('POST', `/api/maps/${map.id}/duplicate`);
    expect(en.json<{ map: StoryMap }>().map.title).toBe('Atlas (copy)');
    const zh = await h.api('POST', `/api/maps/${map.id}/duplicate`, { locale: 'zh-CN' });
    expect(zh.json<{ map: StoryMap }>().map.title).toBe('Atlas（副本）');
    const bad = await h.api('POST', `/api/maps/${map.id}/duplicate`, { locale: 'x' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('section duplicate with a locale (I18N-06)', () => {
  it('adds the copy suffix of the requested language, and nothing to an untitled section', async () => {
    const book = await h.createBook();
    const chapter = await h.createNode(book.id, 'chapter', null, 'Rain');
    const untitled = await h.createNode(book.id, 'chapter', null, '');
    const en = await h.api('POST', `/api/nodes/${chapter.id}/duplicate`);
    expect(en.json<{ node: TreeNode }>().node.title).toBe('Rain (copy)');
    const zh = await h.api('POST', `/api/nodes/${chapter.id}/duplicate`, { locale: 'zh-CN' });
    expect(zh.json<{ node: TreeNode }>().node.title).toBe('Rain（副本）');
    const blank = await h.api('POST', `/api/nodes/${untitled.id}/duplicate`, { locale: 'zh-CN' });
    expect(blank.json<{ node: TreeNode }>().node.title).toBe('');
    expect(
      (await h.api('POST', `/api/nodes/${chapter.id}/duplicate`, { locale: 'x' })).statusCode,
    ).toBe(400);
  });
});

describe('GET /api/books/:id/export with lang (I18N-07)', () => {
  it('writes the placeholder for an untitled section in the requested language', async () => {
    const book = await h.createBook('Export Me');
    await h.createNode(book.id, 'chapter', null, '', { numbered: false });
    const en = await h.api('GET', `/api/books/${book.id}/export?format=md`);
    expect(en.body).toContain('(untitled)');
    const zh = await h.api('GET', `/api/books/${book.id}/export?format=md&lang=zh-CN`);
    expect(zh.body).toContain('（无标题）');
    expect(zh.body).not.toContain('(untitled)');
    expect((await h.api('GET', `/api/books/${book.id}/export?format=md&lang=xx`)).statusCode).toBe(
      400,
    );
  });
});

describe('POST /api/import/text with a locale (I18N-06)', () => {
  const text = ['作者的话', '', '第一章 开始', '他回来了。', '第二章 雨夜', '雨下了一夜。'].join(
    '\n',
  );
  const upload = (fields: Record<string, string>) =>
    h.app.inject({
      method: 'POST',
      url: '/api/import/text',
      ...multipartBody([
        ...Object.entries(fields).map(([name, data]) => ({ name, data })),
        { name: 'file', filename: 'book.txt', data: text },
      ]),
    });

  it('names the front matter section and seeds the Codex in the requested language', async () => {
    const preview = await upload({ mode: 'preview', locale: 'zh-CN' });
    expect(preview.json<ImportPreviewResponse>().sections[0]!.title).toBe('前言');

    const res = await upload({ mode: 'commit', locale: 'zh-CN' });
    expect(res.statusCode).toBe(201);
    const { book } = res.json<ImportTextCommitResponse>();
    expect((await categoriesOf(book.id))[0]!.name).toBe('人物');
    expect((await treeOf(book.id))[0]!.title).toBe('前言');
  });

  it('keeps English without a locale, and the preset follows the file', async () => {
    const res = await upload({ mode: 'commit' });
    const { book } = res.json<ImportTextCommitResponse>();
    expect(book.structure).toEqual(CHINESE_STRUCTURE);
    expect((await categoriesOf(book.id))[0]!.name).toBe('Characters');
    expect((await treeOf(book.id))[0]!.title).toBe('Front matter');
  });

  it('rejects an invalid locale', async () => {
    expect((await upload({ mode: 'preview', locale: 'xx' })).statusCode).toBe(400);
  });
});

describe('cold backup import with a locale (I18N-06)', () => {
  async function exportOwnBackup(): Promise<{ file: string; book: Book }> {
    const book = await h.createBook('The Lantern Road');
    const dir = path.join(h.tmp, 'cold');
    fs.mkdirSync(dir);
    const service = new ColdBackupService({
      db: h.store.db,
      paths: h.store.paths,
      homedir: h.home,
    });
    return { file: service.exportBook(book.id, { dir }).file, book };
  }

  it('adds the restored-title suffix in the requested language', async () => {
    const { file } = await exportOwnBackup();
    const now = new Date('2026-11-02T10:00:00Z');
    const zh = restoreColdBackup(h.store.db, h.store.paths, fs.readFileSync(file), {
      now,
      locale: 'zh-CN',
    });
    expect(zh.book.title).toBe('The Lantern Road（恢复于 2026-11-02）');
    const en = restoreColdBackup(h.store.db, h.store.paths, fs.readFileSync(file), { now });
    expect(en.book.title).toBe('The Lantern Road (restored 2026-11-02)');
  });

  it('takes the locale as a multipart field and rejects an invalid one', async () => {
    const { file } = await exportOwnBackup();
    const send = (locale: string) =>
      h.app.inject({
        method: 'POST',
        url: '/api/import/cold-backup',
        ...multipartBody([
          { name: 'locale', data: locale },
          { name: 'file', filename: 'book.novelstudio.json', data: fs.readFileSync(file) },
        ]),
      });
    const ok = await send('zh-CN');
    expect(ok.statusCode).toBe(201);
    expect(ok.json<{ book: Book }>().book.title).toContain('（恢复于 ');
    expect((await send('xx')).statusCode).toBe(400);
  });
});

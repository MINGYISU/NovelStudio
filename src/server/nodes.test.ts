import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Book } from '../shared/schemas/book.ts';
import { DEFAULT_STRUCTURE } from '../shared/schemas/structure.ts';
import { assertTreeInvariants } from '../shared/tree.ts';
import { computeDisplayTitles } from '../shared/numbering.ts';
import type { NodeKind, TreeNode } from '../shared/types.ts';
import { buildApp } from './app.ts';
import { openDataStore, type DataStore } from './bootstrap.ts';

const PORT = 4317;
const HOST = { host: `127.0.0.1:${PORT}` };
const MISSING = '00000000-0000-4000-8000-000000000000';

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

async function createBook(title = 'Test Book'): Promise<Book> {
  const res = await api('POST', '/api/books', { title });
  expect(res.statusCode).toBe(201);
  return res.json<Book>();
}

async function createNode(
  bookId: string,
  kind: NodeKind,
  parentId: string | null,
  title = '',
  extra: object = {},
): Promise<TreeNode> {
  const res = await api('POST', `/api/books/${bookId}/nodes`, { kind, parentId, title, ...extra });
  expect(res.statusCode).toBe(201);
  return res.json<{ node: TreeNode }>().node;
}

async function getTree(bookId: string): Promise<TreeNode[]> {
  const res = await api('GET', `/api/books/${bookId}/tree`);
  expect(res.statusCode).toBe(200);
  return res.json<{ nodes: TreeNode[] }>().nodes;
}

function liveTitles(nodes: TreeNode[], parentId: string | null): string[] {
  return nodes
    .filter((n) => n.parentId === parentId && n.deletedAt === null)
    .sort((a, b) => a.position - b.position)
    .map((n) => n.title);
}

async function bookWithChapters(count = 5): Promise<{ book: Book; chapters: TreeNode[] }> {
  const book = await createBook();
  const chapters: TreeNode[] = [];
  for (let i = 1; i <= count; i++)
    chapters.push(await createNode(book.id, 'chapter', null, `Ch${i}`));
  return { book, chapters };
}

describe('create and read the tree', () => {
  it('creates nodes, appends by default and honours the index', async () => {
    const book = await createBook();
    const a = await createNode(book.id, 'chapter', null, 'A');
    const b = await createNode(book.id, 'chapter', null, 'B');
    const first = await createNode(book.id, 'chapter', null, 'First', { index: 0 });
    expect([a.position, b.position, first.position]).toEqual([0, 1, 0]);
    const nodes = await getTree(book.id);
    expect(liveTitles(nodes, null)).toEqual(['First', 'A', 'B']);
    assertTreeInvariants(nodes);
  });

  it('returns nodes without content and with the documented fields', async () => {
    const book = await createBook();
    const node = await createNode(book.id, 'chapter', null, 'One');
    expect(node).toEqual({
      id: expect.any(String),
      bookId: book.id,
      parentId: null,
      kind: 'chapter',
      title: 'One',
      position: 0,
      numbered: true,
      status: 'draft',
      synopsis: '',
      wordCount: 0,
      deletedAt: null,
    });
    expect(Object.keys((await getTree(book.id))[0] as object)).not.toContain('content');
  });

  it('defaults numbered from the kind: scenes are unnumbered', async () => {
    const book = await createBook();
    const chapter = await createNode(book.id, 'chapter', null, 'C');
    const scene = await createNode(book.id, 'scene', chapter.id, 'S');
    expect(chapter.numbered).toBe(true);
    expect(scene.numbered).toBe(false);
    const forced = await createNode(book.id, 'scene', chapter.id, 'S2', { numbered: true });
    expect(forced.numbered).toBe(true);
  });

  it('applies the structure settings stored on the book', async () => {
    const book = await createBook();
    const structure = {
      volume: {
        label: 'V',
        format: 'V{n}',
        restartWithin: 'book',
        separator: ' ',
        defaultNumbered: true,
      },
      part: {
        label: 'P',
        format: 'P{n}',
        restartWithin: 'book',
        separator: ' ',
        defaultNumbered: true,
      },
      chapter: {
        label: 'C',
        format: 'C{n}',
        restartWithin: 'book',
        separator: ' ',
        defaultNumbered: false,
      },
      scene: {
        label: 'S',
        format: 'S{n}',
        restartWithin: 'chapter',
        separator: ' ',
        defaultNumbered: false,
      },
    };
    store.db
      .prepare('UPDATE books SET settings = ? WHERE id = ?')
      .run(JSON.stringify({ structure }), book.id);
    expect((await createNode(book.id, 'chapter', null, 'C')).numbered).toBe(false);
  });

  it('falls back to defaults when the stored settings are invalid', async () => {
    const book = await createBook();
    store.db.prepare('UPDATE books SET settings = ? WHERE id = ?').run('{not json', book.id);
    expect((await createNode(book.id, 'chapter', null, 'C')).numbered).toBe(true);
  });

  it('rejects the rank rule, unknown parents, bad indexes and bad bodies', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'P');
    const chapter = await createNode(book.id, 'chapter', part.id, 'C');
    const post = (body: object) => api('POST', `/api/books/${book.id}/nodes`, body);

    const rank = await post({ kind: 'part', parentId: chapter.id });
    expect(rank.statusCode).toBe(409);
    expect(rank.json().error.code).toBe('INVALID_PARENT');

    expect((await post({ kind: 'chapter', parentId: MISSING })).json().error.code).toBe(
      'NOT_FOUND',
    );

    const index = await post({ kind: 'chapter', parentId: part.id, index: 5 });
    expect(index.statusCode).toBe(400);
    expect(index.json().error.code).toBe('INVALID_INDEX');

    expect((await post({ kind: 'chapter' })).statusCode).toBe(400);
    expect((await post({ kind: 'novel', parentId: null })).json().error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(await getTree(book.id)).toHaveLength(2);
  });

  it('rejects a parent from another book', async () => {
    const one = await createBook('One');
    const two = await createBook('Two');
    const volume = await createNode(one.id, 'volume', null, 'V');
    const res = await api('POST', `/api/books/${two.id}/nodes`, {
      kind: 'chapter',
      parentId: volume.id,
    });
    expect(res.statusCode).toBe(404);
    expect(await getTree(two.id)).toEqual([]);
  });

  it('returns 404 for an unknown book and 400 for a malformed id', async () => {
    expect((await api('GET', `/api/books/${MISSING}/tree`)).statusCode).toBe(404);
    expect((await api('GET', '/api/books/not-a-uuid/tree')).statusCode).toBe(400);
  });
});

describe('PATCH /api/nodes/:id', () => {
  it('updates title, status, synopsis and numbered without touching position', async () => {
    const { book, chapters } = await bookWithChapters(2);
    const target = chapters[1] as TreeNode;
    const res = await api('PATCH', `/api/nodes/${target.id}`, {
      title: 'Renamed',
      status: 'revising',
      synopsis: 'A short note',
      numbered: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ node: TreeNode }>().node).toMatchObject({
      id: target.id,
      title: 'Renamed',
      status: 'revising',
      synopsis: 'A short note',
      numbered: false,
      position: 1,
    });
    expect((await getTree(book.id)).find((n) => n.id === target.id)?.title).toBe('Renamed');
  });

  it('validates the body', async () => {
    const { chapters } = await bookWithChapters(1);
    const id = (chapters[0] as TreeNode).id;
    expect((await api('PATCH', `/api/nodes/${id}`, {})).statusCode).toBe(400);
    expect((await api('PATCH', `/api/nodes/${id}`, { status: 'nope' })).statusCode).toBe(400);
    expect((await api('PATCH', `/api/nodes/${MISSING}`, { title: 'x' })).statusCode).toBe(404);
  });
});

describe('move (MOVE-03..08)', () => {
  it('moves Ch4 before Ch3, updates numbering and returns the updated tree', async () => {
    const { book, chapters } = await bookWithChapters();
    const res = await api('POST', `/api/nodes/${(chapters[3] as TreeNode).id}/move`, {
      parentId: null,
      index: 2,
    });
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json<{ nodes: TreeNode[] }>();
    expect(liveTitles(nodes, null)).toEqual(['Ch1', 'Ch2', 'Ch4', 'Ch3', 'Ch5']);
    const titles = computeDisplayTitles(nodes);
    expect(titles.get((chapters[3] as TreeNode).id)).toBe('Chapter 3 — Ch4');
    expect(titles.get((chapters[2] as TreeNode).id)).toBe('Chapter 4 — Ch3');
    expect(await getTree(book.id)).toEqual(nodes);
  });

  it('keeps the order after the server restarts on the same data directory', async () => {
    const { book, chapters } = await bookWithChapters();
    const ch4 = chapters[3] as TreeNode;
    const move = await api('POST', `/api/nodes/${ch4.id}/move`, { parentId: null, index: 2 });
    expect(move.statusCode).toBe(200);

    await stop();
    await start();

    const nodes = await getTree(book.id);
    expect(liveTitles(nodes, null)).toEqual(['Ch1', 'Ch2', 'Ch4', 'Ch3', 'Ch5']);
    expect(nodes.find((n) => n.id === ch4.id)).toMatchObject({ id: ch4.id, title: 'Ch4' });
    assertTreeInvariants(nodes);
  });

  it('moves a whole subtree between parents (MOVE-03, MOVE-04, MOVE-07)', async () => {
    const book = await createBook();
    const part1 = await createNode(book.id, 'part', null, 'P1');
    const part2 = await createNode(book.id, 'part', null, 'P2');
    const chapter = await createNode(book.id, 'chapter', part1.id, 'C1');
    const scene = await createNode(book.id, 'scene', chapter.id, 'S1');
    store.db
      .prepare('UPDATE nodes SET content = ?, word_count = 9, rev = 4 WHERE id = ?')
      .run('{"type":"doc","content":[{"type":"paragraph"}]}', scene.id);
    const before = store.db.prepare('SELECT * FROM nodes WHERE id = ?').get(scene.id);

    const res = await api('POST', `/api/nodes/${chapter.id}/move`, {
      parentId: part2.id,
      index: 0,
    });
    expect(res.statusCode).toBe(200);
    const nodes = await getTree(book.id);
    expect(nodes.find((n) => n.id === chapter.id)?.parentId).toBe(part2.id);
    expect(nodes.find((n) => n.id === scene.id)?.parentId).toBe(chapter.id);
    expect(liveTitles(nodes, part1.id)).toEqual([]);
    expect(store.db.prepare('SELECT * FROM nodes WHERE id = ?').get(scene.id)).toEqual(before);
    assertTreeInvariants(nodes);
  });

  it('does not change a node’s own fields or timestamps when it moves', async () => {
    const { chapters } = await bookWithChapters(3);
    const target = chapters[2] as TreeNode;
    const before = store.db.prepare('SELECT * FROM nodes WHERE id = ?').get(target.id) as {
      position: number;
    };
    await api('POST', `/api/nodes/${target.id}/move`, { parentId: null, index: 0 });
    const after = store.db.prepare('SELECT * FROM nodes WHERE id = ?').get(target.id) as {
      position: number;
    };
    expect({ ...after, position: 0 }).toEqual({ ...before, position: 0 });
    expect(after.position).toBe(0);
  });

  it('refuses invalid moves and changes nothing', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'P');
    const chapter = await createNode(book.id, 'chapter', part.id, 'C');
    const other = await createNode(book.id, 'chapter', null, 'Other');
    const snapshot = await getTree(book.id);
    const move = (id: string, body: object) => api('POST', `/api/nodes/${id}/move`, body);

    const intoDescendant = await move(part.id, { parentId: chapter.id, index: 0 });
    expect(intoDescendant.statusCode).toBe(409);
    expect(intoDescendant.json().error.code).toBe('INVALID_MOVE');
    expect((await move(part.id, { parentId: part.id, index: 0 })).json().error.code).toBe(
      'INVALID_MOVE',
    );
    expect((await move(other.id, { parentId: chapter.id, index: 0 })).json().error.code).toBe(
      'INVALID_MOVE',
    );
    const badIndex = await move(other.id, { parentId: part.id, index: 9 });
    expect(badIndex.statusCode).toBe(400);
    expect(badIndex.json().error.code).toBe('INVALID_INDEX');
    expect((await move(other.id, { parentId: part.id, index: -1 })).statusCode).toBe(400);
    expect((await move(MISSING, { parentId: null, index: 0 })).statusCode).toBe(404);
    expect((await move(other.id, { parentId: MISSING, index: 0 })).statusCode).toBe(404);
    expect((await move(other.id, { parentId: null })).statusCode).toBe(400);

    expect(await getTree(book.id)).toEqual(snapshot);
  });

  it('is atomic: a failing write rolls the whole move back', async () => {
    const { book, chapters } = await bookWithChapters(3);
    const before = await getTree(book.id);
    store.db.exec(`
      CREATE TRIGGER fail_on_ch1 BEFORE UPDATE OF position ON nodes
      WHEN NEW.title = 'Ch1' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `);
    const res = await api('POST', `/api/nodes/${(chapters[2] as TreeNode).id}/move`, {
      parentId: null,
      index: 0,
    });
    expect(res.statusCode).toBe(500);
    expect(await getTree(book.id)).toEqual(before);
  });

  it('touches the book’s updated_at', async () => {
    const { book, chapters } = await bookWithChapters(2);
    const before = (await api('GET', `/api/books/${book.id}`)).json<Book>().updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await api('POST', `/api/nodes/${(chapters[1] as TreeNode).id}/move`, {
      parentId: null,
      index: 0,
    });
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().updatedAt > before).toBe(true);
  });
});

describe('trash and restore (TREE-08)', () => {
  it('trashes a subtree root, closes the gap and renumbers', async () => {
    const { book, chapters } = await bookWithChapters(3);
    const res = await api('DELETE', `/api/nodes/${(chapters[0] as TreeNode).id}`);
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json<{ nodes: TreeNode[] }>();
    expect(liveTitles(nodes, null)).toEqual(['Ch2', 'Ch3']);
    expect(nodes.find((n) => n.id === (chapters[0] as TreeNode).id)?.deletedAt).toEqual(
      expect.any(String),
    );
    expect(computeDisplayTitles(nodes).get((chapters[1] as TreeNode).id)).toBe('Chapter 1 — Ch2');
    expect(await getTree(book.id)).toEqual(nodes);
    assertTreeInvariants(nodes);
  });

  it('marks only the subtree root and excludes the subtree from the book word count', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'P');
    const chapter = await createNode(book.id, 'chapter', part.id, 'C');
    store.db.prepare('UPDATE nodes SET word_count = 120 WHERE id = ?').run(chapter.id);
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().wordCount).toBe(120);

    await api('DELETE', `/api/nodes/${part.id}`);
    const nodes = await getTree(book.id);
    expect(nodes.find((n) => n.id === chapter.id)?.deletedAt).toBeNull();
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().wordCount).toBe(0);

    await api('POST', `/api/nodes/${part.id}/restore`);
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().wordCount).toBe(120);
  });

  it('restores to the end of the original parent', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'P');
    const c1 = await createNode(book.id, 'chapter', part.id, 'C1');
    await createNode(book.id, 'chapter', part.id, 'C2');
    await api('DELETE', `/api/nodes/${c1.id}`);
    const res = await api('POST', `/api/nodes/${c1.id}/restore`);
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json<{ nodes: TreeNode[] }>();
    expect(liveTitles(nodes, part.id)).toEqual(['C2', 'C1']);
    assertTreeInvariants(nodes);
  });

  it('restores to the book root when the original parent is trashed', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'P');
    const chapter = await createNode(book.id, 'chapter', part.id, 'C');
    await api('DELETE', `/api/nodes/${chapter.id}`);
    await api('DELETE', `/api/nodes/${part.id}`);
    const { nodes } = (await api('POST', `/api/nodes/${chapter.id}/restore`)).json<{
      nodes: TreeNode[];
    }>();
    expect(nodes.find((n) => n.id === chapter.id)).toMatchObject({
      parentId: null,
      deletedAt: null,
    });
    assertTreeInvariants(nodes);
  });

  it('survives a restart', async () => {
    const { book, chapters } = await bookWithChapters(3);
    await api('DELETE', `/api/nodes/${(chapters[1] as TreeNode).id}`);
    await stop();
    await start();
    const nodes = await getTree(book.id);
    expect(liveTitles(nodes, null)).toEqual(['Ch1', 'Ch3']);
    expect(nodes.find((n) => n.id === (chapters[1] as TreeNode).id)?.deletedAt).not.toBeNull();
  });

  it('rejects trashing twice, restoring a live section and unknown ids', async () => {
    const { chapters } = await bookWithChapters(2);
    const id = (chapters[0] as TreeNode).id;
    expect((await api('POST', `/api/nodes/${id}/restore`)).json().error.code).toBe('NOT_TRASHED');
    expect((await api('DELETE', `/api/nodes/${id}`)).statusCode).toBe(200);
    expect((await api('DELETE', `/api/nodes/${id}`)).statusCode).toBe(404);
    expect((await api('DELETE', `/api/nodes/${MISSING}`)).statusCode).toBe(404);
    expect((await api('POST', `/api/nodes/${MISSING}/restore`)).statusCode).toBe(404);
  });

  it('cannot move a trashed section', async () => {
    const { chapters } = await bookWithChapters(2);
    const id = (chapters[0] as TreeNode).id;
    await api('DELETE', `/api/nodes/${id}`);
    expect(
      (await api('POST', `/api/nodes/${id}/move`, { parentId: null, index: 0 })).statusCode,
    ).toBe(404);
  });
});

describe('trashed books', () => {
  it('can be read but not edited (BOOK_TRASHED)', async () => {
    const { book, chapters } = await bookWithChapters(2);
    const id = (chapters[0] as TreeNode).id;
    await api('DELETE', `/api/books/${book.id}`);

    expect((await api('GET', `/api/books/${book.id}/tree`)).statusCode).toBe(200);
    const attempts = [
      api('POST', `/api/books/${book.id}/nodes`, { kind: 'chapter', parentId: null }),
      api('PATCH', `/api/nodes/${id}`, { title: 'x' }),
      api('POST', `/api/nodes/${id}/move`, { parentId: null, index: 1 }),
      api('DELETE', `/api/nodes/${id}`),
      api('POST', `/api/nodes/${id}/duplicate`),
      api('PATCH', `/api/books/${book.id}`, { structure: DEFAULT_STRUCTURE }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('BOOK_TRASHED');
    }
    expect(liveTitles(await getTree(book.id), null)).toEqual(['Ch1', 'Ch2']);
  });
});

describe('duplicate (TREE-06)', () => {
  it('copies a subtree with new ids right after the original and keeps content', async () => {
    const book = await createBook();
    const part = await createNode(book.id, 'part', null, 'Part A');
    const ch1 = await createNode(book.id, 'chapter', part.id, 'Ch1');
    const ch2 = await createNode(book.id, 'chapter', part.id, 'Ch2');
    const scene = await createNode(book.id, 'scene', ch1.id, 'Scene');
    await createNode(book.id, 'part', null, 'Part B');
    store.db
      .prepare(
        `UPDATE nodes SET content = ?, plain_text = ?, word_count = 7, synopsis = 'Made-up synopsis',
                          status = 'revising', numbered = 0 WHERE id = ?`,
      )
      .run('{"type":"doc","content":[{"type":"paragraph"}]}', 'hello world', ch1.id);

    const res = await api('POST', `/api/nodes/${ch1.id}/duplicate`);
    expect(res.statusCode).toBe(201);
    const { node, nodes } = res.json<{ node: TreeNode; nodes: TreeNode[] }>();

    expect(node.id).not.toBe(ch1.id);
    expect(node.parentId).toBe(part.id);
    expect(node.title).toBe('Ch1 (copy)');
    expect(node.position).toBe(1);
    expect(liveTitles(nodes, part.id)).toEqual(['Ch1', 'Ch1 (copy)', 'Ch2']);
    expect(liveTitles(nodes, node.id)).toEqual(['Scene']);
    expect(liveTitles(nodes, null)).toEqual(['Part A', 'Part B']);
    expect(node).toMatchObject({
      wordCount: 7,
      synopsis: 'Made-up synopsis',
      status: 'revising',
      numbered: false,
    });

    const copy = store.db
      .prepare('SELECT content, plain_text, rev FROM nodes WHERE id = ?')
      .get(node.id) as { content: string; plain_text: string; rev: number };
    expect(copy).toEqual({
      content: '{"type":"doc","content":[{"type":"paragraph"}]}',
      plain_text: 'hello world',
      rev: 0,
    });

    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(nodes.length);
    expect(nodes.find((n) => n.id === scene.id)?.parentId).toBe(ch1.id);
    expect(nodes.find((n) => n.id === ch2.id)?.position).toBe(2);
    expect(() => assertTreeInvariants(nodes)).not.toThrow();
  });

  it('skips trashed descendants and leaves untitled copies untitled', async () => {
    const book = await createBook();
    const ch = await createNode(book.id, 'chapter', null, '');
    const keep = await createNode(book.id, 'scene', ch.id, 'Keep');
    const gone = await createNode(book.id, 'scene', ch.id, 'Gone');
    await api('DELETE', `/api/nodes/${gone.id}`);

    const { node, nodes } = (await api('POST', `/api/nodes/${ch.id}/duplicate`)).json<{
      node: TreeNode;
      nodes: TreeNode[];
    }>();
    expect(node.title).toBe('');
    expect(liveTitles(nodes, node.id)).toEqual(['Keep']);
    expect(nodes.filter((n) => n.title === 'Gone')).toHaveLength(1);
    expect(nodes.find((n) => n.id === keep.id)?.parentId).toBe(ch.id);
  });

  it('is atomic: a failure part-way leaves the tree untouched', async () => {
    const book = await createBook();
    const ch = await createNode(book.id, 'chapter', null, 'Ch');
    await createNode(book.id, 'scene', ch.id, 'Scene');
    const before = await getTree(book.id);
    store.db.exec(
      `CREATE TRIGGER fail_copy BEFORE INSERT ON nodes WHEN NEW.kind = 'scene'
         BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    );
    expect((await api('POST', `/api/nodes/${ch.id}/duplicate`)).statusCode).toBe(500);
    store.db.exec('DROP TRIGGER fail_copy');
    expect(await getTree(book.id)).toEqual(before);
  });

  it('rejects unknown, trashed and malformed ids', async () => {
    const book = await createBook();
    const ch = await createNode(book.id, 'chapter', null, 'Ch');
    expect((await api('POST', `/api/nodes/${MISSING}/duplicate`)).statusCode).toBe(404);
    expect((await api('POST', '/api/nodes/nope/duplicate')).statusCode).toBe(400);
    await api('DELETE', `/api/nodes/${ch.id}`);
    expect((await api('POST', `/api/nodes/${ch.id}/duplicate`)).statusCode).toBe(404);
  });
});

describe('structure settings via PATCH /api/books/:id', () => {
  const chinese = {
    volume: { ...DEFAULT_STRUCTURE.volume, format: '第{n:cn}卷', separator: ' ' },
    part: { ...DEFAULT_STRUCTURE.part, format: '第{n:cn}部', separator: ' ' },
    chapter: { ...DEFAULT_STRUCTURE.chapter, format: '第{n:cn}章', separator: ' ' },
    scene: { ...DEFAULT_STRUCTURE.scene },
  };

  it('stores the structure, returns it on the book and uses it for new sections', async () => {
    const book = await createBook();
    expect(book.structure).toEqual(DEFAULT_STRUCTURE);
    const noScenes = { ...chinese, chapter: { ...chinese.chapter, defaultNumbered: false } };
    const res = await api('PATCH', `/api/books/${book.id}`, { structure: noScenes });
    expect(res.statusCode).toBe(200);
    expect(res.json<Book>().structure).toEqual(noScenes);
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().structure).toEqual(noScenes);
    expect((await createNode(book.id, 'chapter', null, 'C')).numbered).toBe(false);
  });

  it('keeps other settings keys and does not touch the tree', async () => {
    const { book } = await bookWithChapters(2);
    store.db
      .prepare('UPDATE books SET settings = ? WHERE id = ?')
      .run(JSON.stringify({ display: { fontSize: 18 } }), book.id);
    const before = await getTree(book.id);
    expect((await api('PATCH', `/api/books/${book.id}`, { structure: chinese })).statusCode).toBe(
      200,
    );
    const row = store.db.prepare('SELECT settings FROM books WHERE id = ?').get(book.id) as {
      settings: string;
    };
    expect(JSON.parse(row.settings)).toEqual({ display: { fontSize: 18 }, structure: chinese });
    expect(await getTree(book.id)).toEqual(before);
  });

  it('rejects invalid structures', async () => {
    const book = await createBook();
    const bad = {
      ...DEFAULT_STRUCTURE,
      part: { ...DEFAULT_STRUCTURE.part, restartWithin: 'chapter' },
    };
    expect((await api('PATCH', `/api/books/${book.id}`, { structure: bad })).statusCode).toBe(400);
    expect((await api('PATCH', `/api/books/${book.id}`, { structure: {} })).statusCode).toBe(400);
    expect((await api('GET', `/api/books/${book.id}`)).json<Book>().structure).toEqual(
      DEFAULT_STRUCTURE,
    );
  });
});

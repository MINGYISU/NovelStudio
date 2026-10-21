import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyMapData, type MapData, type StoryMap } from '../shared/schemas/map.ts';
import { Harness } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function createMap(bookId: string, body: object = { template: 'blank' }): Promise<StoryMap> {
  const res = await h.api('POST', `/api/books/${bookId}/maps`, body);
  expect(res.statusCode).toBe(201);
  return res.json<{ map: StoryMap }>().map;
}

async function listMaps(bookId: string): Promise<StoryMap[]> {
  const res = await h.api('GET', `/api/books/${bookId}/maps`);
  expect(res.statusCode).toBe(200);
  return res.json<{ maps: StoryMap[] }>().maps;
}

const dataOf = (title: string): MapData => ({
  nodes: [
    {
      id: 'n1',
      position: { x: 12, y: 34 },
      data: { title, description: 'd', color: '#aabbcc', storyTime: 'Year 3', links: [] },
    },
  ],
  edges: [],
  viewport: { x: 5, y: 6, zoom: 0.5 },
  layoutDirection: 'LR',
});

describe('maps CRUD (MAP-01, MAP-02)', () => {
  it('starts empty and creates maps from each template', async () => {
    const book = await h.createBook();
    expect(await listMaps(book.id)).toEqual([]);

    const blank = await createMap(book.id, { template: 'blank', title: 'My map' });
    expect(blank).toMatchObject({
      title: 'My map',
      template: 'blank',
      position: 0,
      damaged: false,
    });
    expect(blank.data).toEqual(emptyMapData());

    const tree = await createMap(book.id, { template: 'plot-tree' });
    expect(tree.title).toBe('Plot tree');
    expect(tree.data.nodes.length).toBeGreaterThan(2);
    expect(tree.data.layoutDirection).toBe('TB');
    expect(tree.position).toBe(1);

    const timeline = await createMap(book.id, { template: 'timeline' });
    expect(timeline.data.layoutDirection).toBe('LR');
    const arc = await createMap(book.id, { template: 'character-arc' });
    expect(arc.data.nodes[0]!.data.title).toBe('Start state');
    expect((await listMaps(book.id)).map((m) => m.template)).toEqual([
      'blank',
      'plot-tree',
      'timeline',
      'character-arc',
    ]);
  });

  it('renames a map and rejects an empty title or an unknown template', async () => {
    const book = await h.createBook();
    const map = await createMap(book.id);
    const res = await h.api('PATCH', `/api/maps/${map.id}`, { title: '  Renamed  ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ map: StoryMap }>().map.title).toBe('Renamed');
    expect((await h.api('PATCH', `/api/maps/${map.id}`, { title: ' ' })).statusCode).toBe(400);
    expect((await h.api('POST', `/api/books/${book.id}/maps`, { template: 'x' })).statusCode).toBe(
      400,
    );
  });

  it('duplicates a map right after the original with the same content', async () => {
    const book = await h.createBook();
    const first = await createMap(book.id, { template: 'timeline', title: 'First' });
    const second = await createMap(book.id, { template: 'blank', title: 'Second' });
    const res = await h.api('POST', `/api/maps/${first.id}/duplicate`);
    expect(res.statusCode).toBe(201);
    const copy = res.json<{ map: StoryMap }>().map;
    expect(copy.id).not.toBe(first.id);
    expect(copy.title).toBe('First (copy)');
    expect(copy.data).toEqual(first.data);
    expect((await listMaps(book.id)).map((m) => [m.title, m.position])).toEqual([
      ['First', 0],
      ['First (copy)', 1],
      ['Second', 2],
    ]);
    expect(second.id).toBeTruthy();
  });

  it('deletes a map and closes the gap in the order', async () => {
    const book = await h.createBook();
    const a = await createMap(book.id, { template: 'blank', title: 'A' });
    await createMap(book.id, { template: 'blank', title: 'B' });
    const res = await h.api('DELETE', `/api/maps/${a.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ maps: StoryMap[] }>().maps.map((m) => [m.title, m.position])).toEqual([
      ['B', 0],
    ]);
    expect((await h.api('DELETE', `/api/maps/${a.id}`)).statusCode).toBe(404);
  });

  it('answers 404 for an unknown book or map and 400 for a malformed id', async () => {
    expect((await h.api('GET', `/api/books/${MISSING}/maps`)).statusCode).toBe(404);
    expect(
      (await h.api('POST', `/api/books/${MISSING}/maps`, { template: 'blank' })).statusCode,
    ).toBe(404);
    expect((await h.api('PATCH', `/api/maps/${MISSING}`, { title: 'x' })).statusCode).toBe(404);
    expect((await h.api('POST', `/api/maps/${MISSING}/duplicate`)).statusCode).toBe(404);
    expect((await h.api('PATCH', '/api/maps/nope', { title: 'x' })).statusCode).toBe(400);
  });
});

describe('saving map data (MAP-08)', () => {
  it('stores positions, viewport, direction and fields, and they survive a restart', async () => {
    const book = await h.createBook();
    const map = await createMap(book.id, { template: 'blank' });
    const res = await h.api('PUT', `/api/maps/${map.id}/data`, { data: dataOf('Kept') });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json<{ updatedAt: string }>().updatedAt).toBe('string');

    await h.restart();
    const [stored] = await listMaps(book.id);
    expect(stored!.data).toEqual(dataOf('Kept'));
    expect(stored!.damaged).toBe(false);
  });

  it('keeps the maps in their order across a restart', async () => {
    const book = await h.createBook();
    await createMap(book.id, { template: 'blank', title: 'One' });
    await createMap(book.id, { template: 'blank', title: 'Two' });
    await h.restart();
    expect((await listMaps(book.id)).map((m) => m.title)).toEqual(['One', 'Two']);
  });

  it('rejects invalid data and stores nothing', async () => {
    const book = await h.createBook();
    const map = await createMap(book.id, { template: 'blank' });
    const bad = dataOf('x');
    bad.edges.push({ id: 'e', source: 'n1', target: 'ghost', label: '' });
    expect((await h.api('PUT', `/api/maps/${map.id}/data`, { data: bad })).statusCode).toBe(400);
    const badColor = dataOf('x');
    badColor.nodes[0]!.data.color = 'blue';
    expect((await h.api('PUT', `/api/maps/${map.id}/data`, { data: badColor })).statusCode).toBe(
      400,
    );
    expect((await h.api('PUT', `/api/maps/${map.id}/data`, {})).statusCode).toBe(400);
    expect((await listMaps(book.id))[0]!.data).toEqual(emptyMapData());
  });

  it('touches the book so reminders know something changed', async () => {
    const book = await h.createBook();
    const before = (await h.api('GET', `/api/books/${book.id}`)).json<{ updatedAt: string }>();
    const map = await createMap(book.id);
    await new Promise((r) => setTimeout(r, 5));
    await h.api('PUT', `/api/maps/${map.id}/data`, { data: dataOf('x') });
    const after = (await h.api('GET', `/api/books/${book.id}`)).json<{ updatedAt: string }>();
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });
});

describe('trashed books and damaged data', () => {
  it('reads maps of a trashed book but refuses every write with BOOK_TRASHED', async () => {
    const book = await h.createBook();
    const map = await createMap(book.id, { template: 'plot-tree' });
    expect((await h.api('DELETE', `/api/books/${book.id}`)).statusCode).toBeLessThan(300);

    expect(await listMaps(book.id)).toHaveLength(1);
    const attempts = [
      h.api('POST', `/api/books/${book.id}/maps`, { template: 'blank' }),
      h.api('PATCH', `/api/maps/${map.id}`, { title: 'x' }),
      h.api('PUT', `/api/maps/${map.id}/data`, { data: dataOf('x') }),
      h.api('POST', `/api/maps/${map.id}/duplicate`),
      h.api('DELETE', `/api/maps/${map.id}`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('BOOK_TRASHED');
    }
    expect(await listMaps(book.id)).toHaveLength(1);
  });

  it('one corrupt map never hides the others, is flagged, and is never overwritten', async () => {
    const book = await h.createBook();
    const good = await createMap(book.id, { template: 'timeline', title: 'Good' });
    const broken = await createMap(book.id, { template: 'plot-tree', title: 'Broken' });
    const stored = JSON.stringify({
      ...broken.data,
      nodes: [...broken.data.nodes.slice(1), { id: 'oops', position: 'x' }],
    });
    h.store.db.prepare('UPDATE maps SET data = ? WHERE id = ?').run(stored, broken.id);

    const maps = await listMaps(book.id);
    expect(maps.map((m) => [m.title, m.damaged])).toEqual([
      ['Good', false],
      ['Broken', true],
    ]);
    expect(maps[0]!.data).toEqual(good.data);

    const res = await h.api('PUT', `/api/maps/${broken.id}/data`, { data: dataOf('x') });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('MAP_DAMAGED');
    const row = h.store.db.prepare('SELECT data FROM maps WHERE id = ?').get(broken.id) as {
      data: string;
    };
    expect(row.data).toBe(stored);

    // Duplicating keeps the stored text, so even the unreadable part survives in the copy.
    const copy = (await h.api('POST', `/api/maps/${broken.id}/duplicate`)).json<{
      map: StoryMap;
    }>().map;
    const copyRow = h.store.db.prepare('SELECT data FROM maps WHERE id = ?').get(copy.id) as {
      data: string;
    };
    expect(copyRow.data).toBe(stored);
  });

  it('deletes a book purge with its maps', async () => {
    const book = await h.createBook('Gone');
    await createMap(book.id);
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api(
      'DELETE',
      `/api/books/${book.id}?purge=1&confirmTitle=${encodeURIComponent('Gone')}`,
    );
    expect(res.statusCode).toBeLessThan(300);
    const left = h.store.db.prepare('SELECT COUNT(*) AS n FROM maps').get() as { n: number };
    expect(left.n).toBe(0);
  });
});

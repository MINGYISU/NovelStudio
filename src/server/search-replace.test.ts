import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContentDoc } from '../shared/schemas/content.ts';
import type { ReplaceResponse, SearchResponse } from '../shared/schemas/search.ts';
import type { NodeContent } from '../shared/schemas/node.ts';
import type { SnapshotSummary } from '../shared/schemas/snapshot.ts';
import { Harness, paragraphs } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function section(
  bookId: string,
  title: string,
  doc: ContentDoc,
  parentId: string | null = null,
) {
  const node = await h.createNode(bookId, 'chapter', parentId, title);
  const res = await h.saveContent(node.id, doc, 0);
  expect(res.statusCode).toBe(200);
  return node;
}

const search = (bookId: string, body: object) => h.api('POST', `/api/books/${bookId}/search`, body);
const replace = (bookId: string, body: object) =>
  h.api('POST', `/api/books/${bookId}/replace`, body);
const content = async (nodeId: string) =>
  (await h.api('GET', `/api/nodes/${nodeId}`)).json<{ node: NodeContent }>().node;

describe('search (ED-09)', () => {
  it('lists matches per section with excerpts, ignoring trashed sections', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna met anna.'));
    await section(book.id, 'B', paragraphs('Nobody here.'));
    const c = await section(book.id, 'C', paragraphs('ANNA again'));
    const trashed = await section(book.id, 'D', paragraphs('Anna in the trash'));
    expect((await h.api('DELETE', `/api/nodes/${trashed.id}`)).statusCode).toBe(200);

    const res = await search(book.id, { query: 'anna' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SearchResponse>();
    expect(body.total).toBe(3);
    expect(body.sections.map((s) => [s.nodeId, s.count]).sort()).toEqual(
      [
        [a.id, 2],
        [c.id, 1],
      ].sort(),
    );
    expect(body.sections.find((s) => s.nodeId === a.id)?.excerpts[0]).toEqual({
      before: '',
      match: 'Anna',
      after: ' met anna.',
    });
  });

  it('ignores the subtree of a trashed section and honors case sensitivity', async () => {
    const book = await h.createBook();
    const part = await h.createNode(book.id, 'part', null, 'Part');
    await section(book.id, 'Inside', paragraphs('Anna'), part.id);
    await section(book.id, 'Outside', paragraphs('anna'));
    await h.api('DELETE', `/api/nodes/${part.id}`);

    const insensitive = (await search(book.id, { query: 'ANNA' })).json<SearchResponse>();
    expect(insensitive.total).toBe(1);
    const sensitive = (
      await search(book.id, { query: 'ANNA', caseSensitive: true })
    ).json<SearchResponse>();
    expect(sensitive.total).toBe(0);
  });

  it('validates the query and works on a trashed book', async () => {
    const book = await h.createBook();
    await section(book.id, 'A', paragraphs('Anna'));
    expect((await search(book.id, { query: '' })).statusCode).toBe(400);
    expect((await search(book.id, { query: 'x'.repeat(201) })).statusCode).toBe(400);
    expect((await search('00000000-0000-4000-8000-000000000000', { query: 'a' })).statusCode).toBe(
      404,
    );
    await h.api('DELETE', `/api/books/${book.id}`);
    expect((await search(book.id, { query: 'anna' })).statusCode).toBe(200);
  });
});

describe('replace (ED-09)', () => {
  it('replaces in every matching section, snapshots each one first and bumps rev', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna met Anna.'));
    const b = await section(book.id, 'B', paragraphs('Nothing.'));
    const c = await section(book.id, 'C', paragraphs('Then anna left.'));

    const res = await replace(book.id, { query: 'anna', replacement: 'Bea' });
    expect(res.statusCode).toBe(200);
    const body = res.json<ReplaceResponse>();
    expect(body.replaced).toBe(3);
    expect(body.sections.map((s) => s.nodeId).sort()).toEqual([a.id, c.id].sort());

    const after = await content(a.id);
    expect(JSON.stringify(after.content)).toContain('Bea met Bea.');
    expect(after.rev).toBe(2);
    expect(body.sections.find((s) => s.nodeId === a.id)?.rev).toBe(2);
    expect((await content(b.id)).rev).toBe(1);

    const snapshots = (await h.api('GET', `/api/nodes/${a.id}/snapshots`)).json<{
      snapshots: SnapshotSummary[];
    }>().snapshots;
    expect(snapshots.map((s) => s.reason)).toContain('before-replace');
    const before = snapshots.find((s) => s.reason === 'before-replace');
    expect(before?.excerpt).toBe('Anna met Anna.');
    expect(
      (await h.api('GET', `/api/nodes/${b.id}/snapshots`)).json<{ snapshots: unknown[] }>()
        .snapshots,
    ).toHaveLength(0);

    // The replaced text is searchable and the old one is gone.
    expect((await search(book.id, { query: 'anna' })).json<SearchResponse>().total).toBe(0);
    expect((await search(book.id, { query: 'bea' })).json<SearchResponse>().total).toBe(3);
  });

  it('only changes the chosen sections', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna'));
    const c = await section(book.id, 'C', paragraphs('Anna'));
    const res = await replace(book.id, { query: 'Anna', replacement: 'Bea', nodeIds: [a.id] });
    expect(res.json<ReplaceResponse>().replaced).toBe(1);
    expect(JSON.stringify((await content(a.id)).content)).toContain('Bea');
    expect(JSON.stringify((await content(c.id)).content)).toContain('Anna');
  });

  it('keeps formatting, never touches the trash and recomputes word counts', async () => {
    const book = await h.createBook();
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Anna ' },
            { type: 'text', text: 'Anna', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };
    const a = await section(book.id, 'A', doc);
    const gone = await section(book.id, 'Gone', paragraphs('Anna'));
    await h.api('DELETE', `/api/nodes/${gone.id}`);

    const res = await replace(book.id, { query: 'Anna', replacement: 'Bea Rose' });
    const body = res.json<ReplaceResponse>();
    expect(body.replaced).toBe(2);
    expect(body.sections).toHaveLength(1);
    const after = await content(a.id);
    expect(after.wordCount).toBe(4);
    const runs = after.content.content?.[0]?.content;
    expect(runs?.[1]).toMatchObject({ text: 'Bea Rose', marks: [{ type: 'bold' }] });
    expect(JSON.stringify((await content(gone.id)).content)).toContain('Anna');
  });

  it('removes text when the replacement is empty', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('very good'));
    await replace(book.id, { query: 'very ', replacement: '' });
    expect(JSON.stringify((await content(a.id)).content)).toContain('"good"');
  });

  it('is refused for a trashed book and changes nothing', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna'));
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await replace(book.id, { query: 'Anna', replacement: 'Bea' });
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify((await content(a.id)).content)).toContain('Anna');
  });

  it('is atomic: a failure part-way changes no section and leaves no snapshot', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna'));
    const b = await section(book.id, 'B', paragraphs('Anna'));
    // The second section's write fails after the first one succeeded.
    const original = h.store.db.prepare.bind(h.store.db);
    let writes = 0;
    h.store.db.prepare = ((sql: string) => {
      const stmt = original(sql);
      if (sql.includes('UPDATE nodes SET content')) {
        const run = stmt.run.bind(stmt);
        stmt.run = ((...args: unknown[]) => {
          writes += 1;
          if (writes === 2) throw new Error('disk full');
          return run(...args);
        }) as typeof stmt.run;
      }
      return stmt;
    }) as typeof h.store.db.prepare;

    const res = await replace(book.id, { query: 'Anna', replacement: 'Bea' });
    h.store.db.prepare = original as typeof h.store.db.prepare;
    expect(res.statusCode).toBe(500);
    for (const node of [a, b]) {
      expect(JSON.stringify((await content(node.id)).content)).toContain('Anna');
      expect((await content(node.id)).rev).toBe(1);
      expect(
        (await h.api('GET', `/api/nodes/${node.id}/snapshots`)).json<{ snapshots: unknown[] }>()
          .snapshots,
      ).toHaveLength(0);
    }
  });

  it('a before-replace snapshot can be restored', async () => {
    const book = await h.createBook();
    const a = await section(book.id, 'A', paragraphs('Anna'));
    await replace(book.id, { query: 'Anna', replacement: 'Bea' });
    const list = (await h.api('GET', `/api/nodes/${a.id}/snapshots`)).json<{
      snapshots: SnapshotSummary[];
    }>().snapshots;
    const snapshot = list.find((s) => s.reason === 'before-replace');
    expect(snapshot).toBeDefined();
    expect((await h.api('POST', `/api/snapshots/${snapshot!.id}/restore`)).statusCode).toBe(200);
    expect(JSON.stringify((await content(a.id)).content)).toContain('Anna');
  });

  it('rejects a replacement that is too long', async () => {
    const book = await h.createBook();
    await section(book.id, 'A', paragraphs('Anna'));
    expect(
      (await replace(book.id, { query: 'Anna', replacement: 'x'.repeat(2001) })).statusCode,
    ).toBe(400);
  });
});

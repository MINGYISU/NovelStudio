import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodeContent } from '../shared/schemas/node.ts';
import type { TreeNode } from '../shared/types.ts';
import { getBook } from './repos/books.ts';
import { getNodeContentRow } from './repos/nodes.ts';
import { Harness, paragraphs } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';
let h: Harness;

beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function setup() {
  const book = await h.createBook();
  const node = await h.createNode(book.id, 'chapter', null, 'One');
  return { book, node };
}

async function get(id: string): Promise<NodeContent> {
  const res = await h.api('GET', `/api/nodes/${id}`);
  expect(res.statusCode).toBe(200);
  return res.json<{ node: NodeContent }>().node;
}

describe('GET /api/nodes/:id', () => {
  it('returns an empty document at revision 0 for a new section', async () => {
    const { node } = await setup();
    const loaded = await get(node.id);
    expect(loaded).toMatchObject({
      id: node.id,
      rev: 0,
      wordCount: 0,
      content: { type: 'doc', content: [] },
    });
  });

  it('is 404 for an unknown section and 400 for a malformed id', async () => {
    expect((await h.api('GET', `/api/nodes/${MISSING}`)).statusCode).toBe(404);
    expect((await h.api('GET', '/api/nodes/nope')).statusCode).toBe(400);
  });
});

describe('PUT /api/nodes/:id/content (ED-05, ED-07)', () => {
  it('saves, bumps the revision and derives plain text and word count', async () => {
    const { node, book } = await setup();
    const doc = paragraphs('The rain had stopped.', '她没有抬头。');
    const res = await h.saveContent(node.id, doc, 0);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rev: 1, wordCount: 4 + 5 });

    const row = getNodeContentRow(h.store.db, node.id)!;
    expect(row.plainText).toBe('The rain had stopped.\n\n她没有抬头。');
    expect(row.rev).toBe(1);
    expect(await get(node.id)).toMatchObject({ rev: 1, wordCount: 9, content: doc });

    const tree = (await h.api('GET', `/api/books/${book.id}/tree`)).json<{ nodes: TreeNode[] }>();
    expect(tree.nodes[0]?.wordCount).toBe(9);
    expect(getBook(h.store.db, book.id)?.wordCount).toBe(9);
  });

  it('rejects a stale revision with 409 STALE_REVISION and changes nothing', async () => {
    const { node } = await setup();
    expect((await h.saveContent(node.id, paragraphs('first'), 0)).statusCode).toBe(200);
    expect((await h.saveContent(node.id, paragraphs('second'), 1)).statusCode).toBe(200);

    const stale = await h.saveContent(node.id, paragraphs('from an old tab'), 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('STALE_REVISION');
    const future = await h.saveContent(node.id, paragraphs('from the future'), 7);
    expect(future.statusCode).toBe(409);

    expect(await get(node.id)).toMatchObject({ rev: 2, content: paragraphs('second') });
  });

  it('does not bump the revision when the text is unchanged', async () => {
    const { node } = await setup();
    await h.saveContent(node.id, paragraphs('same'), 0);
    const again = await h.saveContent(node.id, paragraphs('same'), 1);
    expect(again.json()).toEqual({ rev: 1, wordCount: 1 });
    expect(await get(node.id)).toMatchObject({ rev: 1 });
  });

  it('survives a restart', async () => {
    const { node } = await setup();
    await h.saveContent(node.id, paragraphs('kept'), 0);
    await h.restart();
    expect(await get(node.id)).toMatchObject({ rev: 1, content: paragraphs('kept') });
  });

  it.each([
    ['an unknown node type', { type: 'doc', content: [{ type: 'bulletList' }] }],
    [
      'a script-ish highlight color',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'a',
                marks: [{ type: 'highlight', attrs: { color: 'url(x)' } }],
              },
            ],
          },
        ],
      },
    ],
    ['a non-doc root', { type: 'paragraph' }],
  ])('rejects %s with 400', async (_name, content) => {
    const { node } = await setup();
    const res = await h.api('PUT', `/api/nodes/${node.id}/content`, { content, rev: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await get(node.id)).toMatchObject({ rev: 0 });
  });

  it('rejects a missing rev and a negative rev', async () => {
    const { node } = await setup();
    const doc = paragraphs('x');
    expect((await h.api('PUT', `/api/nodes/${node.id}/content`, { content: doc })).statusCode).toBe(
      400,
    );
    expect((await h.saveContent(node.id, doc, -1)).statusCode).toBe(400);
  });

  it('refuses sections that are trashed or in a trashed book, and unknown sections', async () => {
    const { node, book } = await setup();
    expect((await h.saveContent(MISSING, paragraphs('x'), 0)).statusCode).toBe(404);

    await h.api('DELETE', `/api/nodes/${node.id}`);
    expect((await h.saveContent(node.id, paragraphs('x'), 0)).statusCode).toBe(404);
    await h.api('POST', `/api/nodes/${node.id}/restore`);

    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.saveContent(node.id, paragraphs('x'), 0);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BOOK_TRASHED');
  });

  it('touches the book so the library sorts by last edit', async () => {
    const { node, book } = await setup();
    const before = getBook(h.store.db, book.id)!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await h.saveContent(node.id, paragraphs('x'), 0);
    expect(getBook(h.store.db, book.id)!.updatedAt > before).toBe(true);
  });
});

describe('onWrite hook (hourly hot backup dirty flag)', () => {
  it('fires after successful writes only', async () => {
    await h.cleanup();
    let writes = 0;
    h = await new Harness({ onWrite: () => (writes += 1) }).start();
    const { node } = await setup();
    const afterSetup = writes;
    expect(afterSetup).toBeGreaterThan(0);
    await h.api('GET', `/api/nodes/${node.id}`);
    await h.saveContent(MISSING, paragraphs('x'), 0);
    expect(writes).toBe(afterSetup);
    await h.saveContent(node.id, paragraphs('x'), 0);
    expect(writes).toBe(afterSetup + 1);
  });
});

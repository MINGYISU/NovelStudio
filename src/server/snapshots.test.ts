import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeContent } from '../shared/schemas/node.ts';
import type { SnapshotSummary } from '../shared/schemas/snapshot.ts';
import { getNodeContentRow } from './repos/nodes.ts';
import { Harness, paragraphs } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';
const MINUTE = 60_000;
let h: Harness;
let clock: number;

beforeEach(async () => {
  clock = Date.parse('2026-10-20T10:00:00Z');
  vi.useFakeTimers({ toFake: ['Date'], now: clock });
  h = await new Harness().start();
});
afterEach(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

function advance(ms: number): void {
  clock += ms;
  vi.setSystemTime(clock);
}

async function setup() {
  const book = await h.createBook();
  const node = await h.createNode(book.id, 'chapter', null, 'One');
  return { book, node };
}

async function list(nodeId: string): Promise<SnapshotSummary[]> {
  const res = await h.api('GET', `/api/nodes/${nodeId}/snapshots`);
  expect(res.statusCode).toBe(200);
  return res.json<{ snapshots: SnapshotSummary[] }>().snapshots;
}

/** Saves `text` on top of the current revision. */
async function write(nodeId: string, text: string): Promise<number> {
  const rev = getNodeContentRow(h.store.db, nodeId)!.rev;
  const res = await h.saveContent(nodeId, paragraphs(text), rev);
  expect(res.statusCode).toBe(200);
  return res.json<{ rev: number }>().rev;
}

describe('snapshots on save (SNAP-01)', () => {
  it('keeps nothing for the very first text, then snapshots the previous text on the first edit', async () => {
    const { node } = await setup();
    await write(node.id, 'draft one');
    expect(await list(node.id)).toHaveLength(0);

    await write(node.id, 'draft two');
    const snapshots = await list(node.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ reason: 'open', wordCount: 2, excerpt: 'draft one' });
  });

  it('snapshots at most every 10 minutes while editing', async () => {
    const { node } = await setup();
    await write(node.id, 'a');
    await write(node.id, 'b');
    expect(await list(node.id)).toHaveLength(1);

    advance(5 * MINUTE);
    await write(node.id, 'c');
    expect(await list(node.id)).toHaveLength(1);

    advance(6 * MINUTE);
    await write(node.id, 'd');
    const snapshots = await list(node.id);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ reason: 'interval', excerpt: 'c' });
  });

  it('snapshots again on the first edit after a server restart', async () => {
    const { node } = await setup();
    await write(node.id, 'a');
    await write(node.id, 'b');
    await h.restart();
    advance(MINUTE);
    await write(node.id, 'c');
    expect(await list(node.id)).toHaveLength(2);
  });

  it('keeps only the newest 50', async () => {
    const { node } = await setup();
    await write(node.id, 'start');
    for (let i = 0; i < 55; i++) {
      advance(11 * MINUTE);
      await write(node.id, `version ${i}`);
    }
    const snapshots = await list(node.id);
    expect(snapshots).toHaveLength(50);
    expect(snapshots[0]?.excerpt).toBe('version 53');
    expect(snapshots.at(-1)?.excerpt).toBe('version 4');
  });
});

describe('snapshot browser and restore (ED-10)', () => {
  it('shows a snapshot with its full text', async () => {
    const { node } = await setup();
    await write(node.id, 'old text\n\nsecond');
    await write(node.id, 'new text');
    const [snap] = await list(node.id);
    const res = await h.api('GET', `/api/snapshots/${snap!.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().snapshot.plainText).toBe('old text\n\nsecond');
  });

  it('restores an old version after snapshotting the current text first', async () => {
    const { node } = await setup();
    await write(node.id, 'the good paragraph');
    await write(node.id, 'oops, deleted everything');
    const [snap] = await list(node.id);

    advance(MINUTE);
    const res = await h.api('POST', `/api/snapshots/${snap!.id}/restore`);
    expect(res.statusCode).toBe(200);
    const restored = res.json<{ node: NodeContent }>().node;
    expect(restored.content).toEqual(paragraphs('the good paragraph'));
    expect(restored.rev).toBe(3);

    const row = getNodeContentRow(h.store.db, node.id)!;
    expect(row.plainText).toBe('the good paragraph');
    expect(row.rev).toBe(3);

    const snapshots = await list(node.id);
    expect(snapshots[0]).toMatchObject({
      reason: 'before-restore',
      excerpt: 'oops, deleted everything',
    });

    // The pre-restore text can itself be restored.
    const back = await h.api('POST', `/api/snapshots/${snapshots[0]!.id}/restore`);
    expect(back.json().node.content).toEqual(paragraphs('oops, deleted everything'));
  });

  it('makes an open editor stale: a save based on the old revision is rejected', async () => {
    const { node } = await setup();
    await write(node.id, 'a');
    const rev = await write(node.id, 'b');
    const [snap] = await list(node.id);
    await h.api('POST', `/api/snapshots/${snap!.id}/restore`);
    expect((await h.saveContent(node.id, paragraphs('late'), rev)).statusCode).toBe(409);
  });

  it('is 404 for unknown ids and refused for a trashed book', async () => {
    const { node, book } = await setup();
    expect((await h.api('GET', `/api/snapshots/${MISSING}`)).statusCode).toBe(404);
    expect((await h.api('POST', `/api/snapshots/${MISSING}/restore`)).statusCode).toBe(404);
    expect((await h.api('GET', `/api/nodes/${MISSING}/snapshots`)).statusCode).toBe(404);

    await write(node.id, 'a');
    await write(node.id, 'b');
    const [snap] = await list(node.id);
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api('POST', `/api/snapshots/${snap!.id}/restore`);
    expect(res.statusCode).toBe(409);
    expect(getNodeContentRow(h.store.db, node.id)!.plainText).toBe('b');
  });
});

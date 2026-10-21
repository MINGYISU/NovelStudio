import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContentDoc } from '../shared/schemas/content.ts';
import type { Occurrence, Thread } from '../shared/schemas/foreshadow.ts';
import type { SnapshotSummary } from '../shared/schemas/snapshot.ts';
import { getNodeContentRow } from './repos/nodes.ts';
import { Harness, paragraphs } from './test-support.ts';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

/** A paragraph in which `text` carries the anchor of `occurrenceId`. */
const anchored = (occurrenceId: string, text = 'The needle shook.'): ContentDoc => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Before. ' },
        { type: 'text', text, marks: [{ type: 'foreshadowAnchor', attrs: { occurrenceId } }] },
      ],
    },
  ],
});

async function save(nodeId: string, content: ContentDoc) {
  const rev = getNodeContentRow(h.store.db, nodeId)!.rev;
  const res = await h.saveContent(nodeId, content, rev);
  expect(res.statusCode).toBe(200);
}

async function setup() {
  const book = await h.createBook();
  const ch2 = await h.createNode(book.id, 'chapter', null, 'Ch2');
  const ch5 = await h.createNode(book.id, 'chapter', null, 'Ch5');
  const created = await h.api('POST', `/api/books/${book.id}/foreshadows`, { title: 'Compass' });
  const thread = created.json<{ thread: Thread }>().thread;
  const occ = await h.api('POST', `/api/foreshadows/${thread.id}/occurrences`, {
    nodeId: ch2.id,
    role: 'setup',
  });
  const occurrence = occ.json<{ thread: Thread }>().thread.occurrences[0]!;
  return { book, ch2, ch5, thread, occurrence };
}

async function occurrenceOf(bookId: string, id: string): Promise<Occurrence> {
  const res = await h.api('GET', `/api/books/${bookId}/foreshadows`);
  const all = res.json<{ threads: Thread[] }>().threads.flatMap((t) => t.occurrences);
  return all.find((o) => o.id === id)!;
}

describe('anchor extraction on save (FS-08)', () => {
  it('a new occurrence is not anchored until the text carrying the mark is saved', async () => {
    const { book, occurrence } = await setup();
    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      anchored: false,
      anchorState: null,
    });
  });

  it('saving the anchored text marks the occurrence anchored and present in that section', async () => {
    const { book, ch2, occurrence } = await setup();
    await save(ch2.id, anchored(occurrence.id));
    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      nodeId: ch2.id,
      anchored: true,
      anchorState: 'present',
    });
  });

  it('cut from Ch2 and pasted into Ch5: the occurrence follows, whichever section saves first', async () => {
    for (const pasteFirst of [false, true]) {
      const { book, ch2, ch5, occurrence } = await setup();
      await save(ch2.id, anchored(occurrence.id));

      const cut = () => save(ch2.id, paragraphs('Before.'));
      const paste = () => save(ch5.id, anchored(occurrence.id));
      if (pasteFirst) {
        await paste();
        await cut();
      } else {
        await cut();
        await paste();
      }
      expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
        nodeId: ch5.id,
        anchored: true,
        anchorState: 'present',
      });
    }
  });

  it('deleting the anchored text keeps the occurrence and marks it missing; putting it back restores it', async () => {
    const { book, ch2, thread, occurrence } = await setup();
    await save(ch2.id, anchored(occurrence.id));
    await save(ch2.id, paragraphs('Before.'));

    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      nodeId: ch2.id,
      anchored: true,
      anchorState: 'missing',
    });
    const res = await h.api('GET', `/api/books/${book.id}/foreshadows`);
    expect(res.json<{ threads: Thread[] }>().threads[0]!.id).toBe(thread.id);

    await save(ch2.id, anchored(occurrence.id));
    expect((await occurrenceOf(book.id, occurrence.id)).anchorState).toBe('present');
  });

  it('leaves occurrences without an anchor alone and ignores unknown ids', async () => {
    const { book, ch2, occurrence } = await setup();
    await save(ch2.id, anchored(UNKNOWN));
    await save(ch2.id, paragraphs('plain'));
    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      nodeId: ch2.id,
      anchored: false,
      anchorState: null,
    });
  });

  it('ignores an anchor of another book, so pasted text cannot take an occurrence over', async () => {
    const { book, ch2, occurrence } = await setup();
    const other = await h.createBook('Other');
    const foreign = await h.createNode(other.id, 'chapter', null, 'Foreign');
    await save(foreign.id, anchored(occurrence.id));
    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      nodeId: ch2.id,
      anchored: false,
    });
  });

  it('refuses an anchor mark without a valid occurrence id', async () => {
    const { ch2 } = await setup();
    const res = await h.saveContent(ch2.id, anchored('not-an-id'), 0);
    expect(res.statusCode).toBe(400);
  });

  it('a stale save changes nothing, including the occurrence', async () => {
    const { book, ch2, occurrence } = await setup();
    const res = await h.saveContent(ch2.id, anchored(occurrence.id), 7);
    expect(res.statusCode).toBe(409);
    expect((await occurrenceOf(book.id, occurrence.id)).anchored).toBe(false);
  });

  it('restoring a snapshot re-syncs anchors', async () => {
    const { book, ch2, occurrence } = await setup();
    await save(ch2.id, anchored(occurrence.id));
    await save(ch2.id, paragraphs('Rewritten without it.'));
    expect((await occurrenceOf(book.id, occurrence.id)).anchorState).toBe('missing');

    const list = await h.api('GET', `/api/nodes/${ch2.id}/snapshots`);
    const [snapshot] = list.json<{ snapshots: SnapshotSummary[] }>().snapshots;
    const res = await h.api('POST', `/api/snapshots/${snapshot!.id}/restore`);
    expect(res.statusCode).toBe(200);
    expect((await occurrenceOf(book.id, occurrence.id)).anchorState).toBe('present');
  });

  it('duplicating a section keeps the text but leaves the anchor with the original', async () => {
    const { book, ch2, occurrence } = await setup();
    await save(ch2.id, anchored(occurrence.id));
    const res = await h.api('POST', `/api/nodes/${ch2.id}/duplicate`);
    expect(res.statusCode).toBe(201);
    const copyId = res.json<{ node: { id: string } }>().node.id;

    const copy = getNodeContentRow(h.store.db, copyId)!;
    expect(copy.content).not.toContain('foreshadowAnchor');
    expect(copy.plainText).toBe('Before. The needle shook.');
    expect(getNodeContentRow(h.store.db, ch2.id)!.content).toContain('foreshadowAnchor');
    expect(await occurrenceOf(book.id, occurrence.id)).toMatchObject({
      nodeId: ch2.id,
      anchorState: 'present',
    });
  });
});

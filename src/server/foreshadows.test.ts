import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Book } from '../shared/schemas/book.ts';
import type { Thread } from '../shared/schemas/foreshadow.ts';
import { Harness } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function createThread(bookId: string, body: object = { title: 'The compass' }) {
  const res = await h.api('POST', `/api/books/${bookId}/foreshadows`, body);
  expect(res.statusCode).toBe(201);
  return res.json<{ thread: Thread }>().thread;
}

async function addOccurrence(threadId: string, body: object) {
  const res = await h.api('POST', `/api/foreshadows/${threadId}/occurrences`, body);
  expect(res.statusCode).toBe(201);
  return res.json<{ thread: Thread }>().thread;
}

async function listThreads(bookId: string): Promise<Thread[]> {
  const res = await h.api('GET', `/api/books/${bookId}/foreshadows`);
  expect(res.statusCode).toBe(200);
  return res.json<{ threads: Thread[] }>().threads;
}

const bookUpdatedAt = async (id: string) =>
  (await h.api('GET', `/api/books/${id}`)).json<Book>().updatedAt;

describe('threads (FS-01)', () => {
  it('starts empty and creates a thread with the documented defaults', async () => {
    const book = await h.createBook();
    expect(await listThreads(book.id)).toEqual([]);
    const thread = await createThread(book.id, { title: '  The compass  ' });
    expect(thread).toMatchObject({
      bookId: book.id,
      title: 'The compass',
      description: '',
      status: 'planned',
      color: '#c0841a',
      notes: '',
      occurrences: [],
    });
    expect(await listThreads(book.id)).toEqual([thread]);
  });

  it('keeps threads in creation order and updates only the given fields', async () => {
    const book = await h.createBook();
    const first = await createThread(book.id, { title: 'First' });
    const second = await createThread(book.id, { title: 'Second', color: '#112233' });
    expect((await listThreads(book.id)).map((t) => t.title)).toEqual(['First', 'Second']);

    const res = await h.api('PATCH', `/api/foreshadows/${first.id}`, {
      status: 'abandoned',
      notes: 'Dropped.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ thread: Thread }>().thread).toMatchObject({
      title: 'First',
      status: 'abandoned',
      notes: 'Dropped.',
    });
    expect((await listThreads(book.id))[1]).toEqual(second);
  });

  it('rejects invalid bodies', async () => {
    const book = await h.createBook();
    const thread = await createThread(book.id);
    for (const body of [
      { title: '   ' },
      { title: 'x', status: 'lost' },
      { title: 'x', color: 'red' },
      { title: 'x', notes: 'n'.repeat(5001) },
      {},
    ]) {
      const res = await h.api('POST', `/api/books/${book.id}/foreshadows`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    for (const body of [{}, { color: '#12' }, { status: 'x' }, { title: '' }]) {
      const res = await h.api('PATCH', `/api/foreshadows/${thread.id}`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(await listThreads(book.id)).toHaveLength(1);
  });

  it('answers 404 for unknown ids', async () => {
    expect((await h.api('GET', `/api/books/${MISSING}/foreshadows`)).statusCode).toBe(404);
    expect((await h.api('PATCH', `/api/foreshadows/${MISSING}`, { title: 'x' })).statusCode).toBe(
      404,
    );
    expect((await h.api('DELETE', `/api/foreshadows/${MISSING}`)).statusCode).toBe(404);
    expect(
      (
        await h.api('POST', `/api/foreshadows/${MISSING}/occurrences`, {
          nodeId: MISSING,
          role: 'setup',
        })
      ).statusCode,
    ).toBe(404);
    expect((await h.api('PATCH', `/api/occurrences/${MISSING}`, { role: 'hint' })).statusCode).toBe(
      404,
    );
    expect((await h.api('DELETE', `/api/occurrences/${MISSING}`)).statusCode).toBe(404);
  });

  it('shows a stored status or color this version does not know as the default without rewriting it', async () => {
    const book = await h.createBook();
    const thread = await createThread(book.id);
    h.store.db
      .prepare("UPDATE foreshadows SET status = 'weird', color = 'blue' WHERE id = ?")
      .run(thread.id);
    expect((await listThreads(book.id))[0]).toMatchObject({ status: 'planned', color: '#c0841a' });
    expect(
      h.store.db.prepare('SELECT status, color FROM foreshadows WHERE id = ?').get(thread.id),
    ).toEqual({ status: 'weird', color: 'blue' });
  });

  it('deleting a thread removes its occurrences and returns the remaining threads', async () => {
    const book = await h.createBook();
    const ch = await h.createNode(book.id, 'chapter', null, 'One');
    const gone = await createThread(book.id, { title: 'Gone' });
    const kept = await createThread(book.id, { title: 'Kept' });
    await addOccurrence(gone.id, { nodeId: ch.id, role: 'setup' });
    await addOccurrence(kept.id, { nodeId: ch.id, role: 'setup' });

    const res = await h.api('DELETE', `/api/foreshadows/${gone.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ threads: Thread[] }>().threads.map((t) => t.title)).toEqual(['Kept']);
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM foreshadow_occurrences').get()).toEqual({
      n: 1,
    });
    // The section itself is untouched.
    expect((await h.api('GET', `/api/nodes/${ch.id}`)).statusCode).toBe(200);
  });
});

describe('occurrences (FS-02)', () => {
  it('adds any number of each role and keeps them in creation order', async () => {
    const book = await h.createBook();
    const a = await h.createNode(book.id, 'chapter', null, 'A');
    const b = await h.createNode(book.id, 'chapter', null, 'B');
    const thread = await createThread(book.id);
    await addOccurrence(thread.id, { nodeId: a.id, role: 'setup', excerpt: ' quote ', note: 'n' });
    await addOccurrence(thread.id, { nodeId: a.id, role: 'setup' });
    await addOccurrence(thread.id, { nodeId: b.id, role: 'payoff' });
    const updated = await addOccurrence(thread.id, { nodeId: b.id, role: 'payoff' });

    expect(updated.occurrences.map((o) => o.role)).toEqual(['setup', 'setup', 'payoff', 'payoff']);
    expect(updated.occurrences[0]).toMatchObject({
      foreshadowId: thread.id,
      nodeId: a.id,
      excerpt: 'quote',
      note: 'n',
      anchored: false,
      anchorState: null,
    });
    expect((await listThreads(book.id))[0]).toEqual(updated);
  });

  it('updates the role, the section, the excerpt and the note, and deletes an occurrence', async () => {
    const book = await h.createBook();
    const a = await h.createNode(book.id, 'chapter', null, 'A');
    const b = await h.createNode(book.id, 'chapter', null, 'B');
    const thread = await createThread(book.id);
    const [occurrence] = (await addOccurrence(thread.id, { nodeId: a.id, role: 'setup' }))
      .occurrences;

    const res = await h.api('PATCH', `/api/occurrences/${occurrence!.id}`, {
      role: 'hint',
      nodeId: b.id,
      excerpt: 'E',
      note: 'N',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ thread: Thread }>().thread.occurrences[0]).toMatchObject({
      id: occurrence!.id,
      role: 'hint',
      nodeId: b.id,
      excerpt: 'E',
      note: 'N',
    });

    const del = await h.api('DELETE', `/api/occurrences/${occurrence!.id}`);
    expect(del.statusCode).toBe(200);
    expect(del.json<{ thread: Thread }>().thread.occurrences).toEqual([]);
  });

  it('refuses bad roles, missing sections, sections of another book and trashed sections', async () => {
    const book = await h.createBook();
    const otherBook = await h.createBook('Other');
    const ch = await h.createNode(book.id, 'chapter', null, 'A');
    const foreign = await h.createNode(otherBook.id, 'chapter', null, 'Foreign');
    const trashed = await h.createNode(book.id, 'chapter', null, 'Trashed');
    await h.api('DELETE', `/api/nodes/${trashed.id}`);
    const thread = await createThread(book.id);

    const post = (body: object) => h.api('POST', `/api/foreshadows/${thread.id}/occurrences`, body);
    expect((await post({ nodeId: ch.id, role: 'climax' })).statusCode).toBe(400);
    expect((await post({ nodeId: 'not-an-id', role: 'setup' })).statusCode).toBe(400);
    for (const nodeId of [MISSING, foreign.id, trashed.id]) {
      const res = await post({ nodeId, role: 'setup' });
      expect(res.statusCode, nodeId).toBe(409);
      expect(res.json().error.code).toBe('INVALID_SECTION');
    }
    const [occurrence] = (await addOccurrence(thread.id, { nodeId: ch.id, role: 'setup' }))
      .occurrences;
    const move = await h.api('PATCH', `/api/occurrences/${occurrence!.id}`, {
      nodeId: foreign.id,
    });
    expect(move.statusCode).toBe(409);
    expect((await listThreads(book.id))[0]!.occurrences[0]!.nodeId).toBe(ch.id);
  });

  it('a section in the trash keeps its occurrences, and restoring it makes them live again (FS-05e)', async () => {
    const book = await h.createBook();
    const ch = await h.createNode(book.id, 'chapter', null, 'A');
    const thread = await createThread(book.id);
    await addOccurrence(thread.id, { nodeId: ch.id, role: 'setup' });

    await h.api('DELETE', `/api/nodes/${ch.id}`);
    expect((await listThreads(book.id))[0]!.occurrences[0]!.nodeId).toBe(ch.id);
    const tree = (await h.api('GET', `/api/books/${book.id}/tree`)).json<{
      nodes: { id: string; deletedAt: string | null }[];
    }>().nodes;
    expect(tree.find((n) => n.id === ch.id)!.deletedAt).not.toBeNull();

    await h.api('POST', `/api/nodes/${ch.id}/restore`);
    const restored = (await h.api('GET', `/api/books/${book.id}/tree`)).json<{
      nodes: { id: string; deletedAt: string | null }[];
    }>().nodes;
    expect(restored.find((n) => n.id === ch.id)!.deletedAt).toBeNull();
    expect((await listThreads(book.id))[0]!.occurrences[0]!.nodeId).toBe(ch.id);
  });

  it('references survive a move untouched (MOVE-07)', async () => {
    const book = await h.createBook();
    await h.createNode(book.id, 'chapter', null, 'A');
    const b = await h.createNode(book.id, 'chapter', null, 'B');
    const thread = await createThread(book.id);
    await addOccurrence(thread.id, { nodeId: b.id, role: 'payoff' });
    const before = await listThreads(book.id);
    const res = await h.api('POST', `/api/nodes/${b.id}/move`, { parentId: null, index: 0 });
    expect(res.statusCode).toBe(200);
    expect(await listThreads(book.id)).toEqual(before);
  });

  it('purging a book deletes its threads and occurrences with it', async () => {
    const book = await h.createBook('Doomed');
    const ch = await h.createNode(book.id, 'chapter', null, 'A');
    const thread = await createThread(book.id);
    await addOccurrence(thread.id, { nodeId: ch.id, role: 'setup' });
    await h.api('DELETE', `/api/books/${book.id}`);
    const res = await h.api('DELETE', `/api/books/${book.id}?purge=1&confirmTitle=Doomed`);
    expect(res.statusCode).toBe(204);
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM foreshadows').get()).toEqual({ n: 0 });
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM foreshadow_occurrences').get()).toEqual({
      n: 0,
    });
  });
});

describe('book rules', () => {
  it('every write touches the book updated_at', async () => {
    const book = await h.createBook();
    const ch = await h.createNode(book.id, 'chapter', null, 'A');
    let last = await bookUpdatedAt(book.id);
    const expectTouched = async () => {
      const now = await bookUpdatedAt(book.id);
      expect(now > last).toBe(true);
      last = now;
    };
    const tick = () => new Promise((r) => setTimeout(r, 5));

    await tick();
    const thread = await createThread(book.id);
    await expectTouched();
    await tick();
    await h.api('PATCH', `/api/foreshadows/${thread.id}`, { title: 'New' });
    await expectTouched();
    await tick();
    const withOccurrence = await addOccurrence(thread.id, { nodeId: ch.id, role: 'setup' });
    await expectTouched();
    await tick();
    await h.api('PATCH', `/api/occurrences/${withOccurrence.occurrences[0]!.id}`, { note: 'n' });
    await expectTouched();
    await tick();
    await h.api('DELETE', `/api/occurrences/${withOccurrence.occurrences[0]!.id}`);
    await expectTouched();
    await tick();
    await h.api('DELETE', `/api/foreshadows/${thread.id}`);
    await expectTouched();
  });

  it('reads are allowed on a trashed book but every write is 409 BOOK_TRASHED', async () => {
    const book = await h.createBook();
    const ch = await h.createNode(book.id, 'chapter', null, 'A');
    const thread = await createThread(book.id);
    const [occurrence] = (await addOccurrence(thread.id, { nodeId: ch.id, role: 'setup' }))
      .occurrences;
    await h.api('DELETE', `/api/books/${book.id}`);

    expect(await listThreads(book.id)).toHaveLength(1);
    const writes = [
      h.api('POST', `/api/books/${book.id}/foreshadows`, { title: 'x' }),
      h.api('PATCH', `/api/foreshadows/${thread.id}`, { title: 'x' }),
      h.api('DELETE', `/api/foreshadows/${thread.id}`),
      h.api('POST', `/api/foreshadows/${thread.id}/occurrences`, { nodeId: ch.id, role: 'hint' }),
      h.api('PATCH', `/api/occurrences/${occurrence!.id}`, { role: 'payoff' }),
      h.api('DELETE', `/api/occurrences/${occurrence!.id}`),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('BOOK_TRASHED');
    }
    expect((await listThreads(book.id))[0]!.occurrences).toHaveLength(1);
  });

  it('stores the dormant threshold in the book settings, defaults to 10 and keeps other settings', async () => {
    const book = await h.createBook();
    expect(book.foreshadow).toEqual({ dormantAfter: 10 });

    const res = await h.api('PATCH', `/api/books/${book.id}`, { foreshadow: { dormantAfter: 4 } });
    expect(res.statusCode).toBe(200);
    const patched = res.json<Book>();
    expect(patched.foreshadow).toEqual({ dormantAfter: 4 });
    expect(patched.structure).toEqual(book.structure);
    expect(patched.display).toEqual(book.display);

    await h.api('PATCH', `/api/books/${book.id}`, { display: { ...book.display, fontSize: 20 } });
    expect((await h.api('GET', `/api/books/${book.id}`)).json<Book>().foreshadow).toEqual({
      dormantAfter: 4,
    });
    await h.restart();
    expect((await h.api('GET', `/api/books/${book.id}`)).json<Book>().foreshadow).toEqual({
      dormantAfter: 4,
    });

    for (const dormantAfter of [0, -1, 1.5, 1001, 'x']) {
      const bad = await h.api('PATCH', `/api/books/${book.id}`, { foreshadow: { dormantAfter } });
      expect(bad.statusCode, String(dormantAfter)).toBe(400);
    }
  });

  it('falls back to the default threshold when the stored setting is damaged', async () => {
    const book = await h.createBook();
    h.store.db
      .prepare('UPDATE books SET settings = ? WHERE id = ?')
      .run(JSON.stringify({ foreshadow: { dormantAfter: 'lots' } }), book.id);
    expect((await h.api('GET', `/api/books/${book.id}`)).json<Book>().foreshadow).toEqual({
      dormantAfter: 10,
    });
  });
});

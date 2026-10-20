import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentDoc } from '../../../shared/schemas/content.ts';
import { SaveError, SaverRegistry, SectionSaver, type SaveTransport } from './autosave.ts';

const doc = (text: string): ContentDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

interface Call {
  nodeId: string;
  text: string;
  rev: number;
  keepalive: boolean;
  resolve: (r: { rev: number; wordCount: number }) => void;
  reject: (e: unknown) => void;
}

/** A transport whose requests stay open until the test settles them. */
function manualTransport() {
  const calls: Call[] = [];
  const transport: SaveTransport = {
    save: (nodeId, content, rev, options) =>
      new Promise((resolve, reject) => {
        const text = (content.content?.[0]?.content?.[0]?.text as string | undefined) ?? '';
        calls.push({ nodeId, text, rev, keepalive: options.keepalive, resolve, reject });
      }),
  };
  return { calls, transport };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('SectionSaver', () => {
  it('saves about one second after typing stops, sending the newest text and the known revision', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 4, { transport });
    saver.update(doc('a'));
    await vi.advanceTimersByTimeAsync(900);
    saver.update(doc('ab'));
    await vi.advanceTimersByTimeAsync(900);
    expect(calls).toHaveLength(0);
    expect(saver.state).toBe('dirty');

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ text: 'ab', rev: 4 });
    expect(saver.state).toBe('saving');

    calls[0]!.resolve({ rev: 5, wordCount: 1 });
    await settle();
    expect(saver.state).toBe('saved');
    expect(saver.rev).toBe(5);
    expect(saver.unsavedContent()).toBeNull();
  });

  it('flush saves immediately and resolves after the request completes', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    saver.update(doc('x'));
    let done = false;
    const flushed = saver.flush().then(() => (done = true));
    await settle();
    expect(calls).toHaveLength(1);
    expect(done).toBe(false);
    calls[0]!.resolve({ rev: 1, wordCount: 1 });
    await flushed;
    expect(done).toBe(true);
  });

  it('never has two requests in flight and sends text typed meanwhile after the first completes', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    saver.update(doc('one'));
    const flushed = saver.flush();
    await settle();
    saver.update(doc('two'));
    const second = saver.flush();
    await settle();
    expect(calls).toHaveLength(1);

    calls[0]!.resolve({ rev: 1, wordCount: 1 });
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ text: 'two', rev: 1 });
    calls[1]!.resolve({ rev: 2, wordCount: 1 });
    await Promise.all([flushed, second]);
    expect(saver.state).toBe('saved');
    expect(saver.rev).toBe(2);
  });

  it('stops for good after a revision conflict and keeps the unsaved text', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    saver.update(doc('mine'));
    const flushed = saver.flush();
    await settle();
    calls[0]!.reject(new SaveError('stale', 'Changed elsewhere'));
    await flushed;
    expect(saver.state).toBe('stale');
    expect(saver.unsavedContent()).toEqual(doc('mine'));

    saver.update(doc('mine more'));
    await vi.advanceTimersByTimeAsync(10_000);
    await saver.flush();
    expect(calls).toHaveLength(1);
    expect(saver.state).toBe('stale');
  });

  it('keeps the text on failure, reports the error and retries until it works', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport, retryMs: 5000 });
    saver.update(doc('precious'));
    const flushed = saver.flush();
    await settle();
    calls[0]!.reject(new SaveError('failed', 'Cannot reach the NovelStudio server.'));
    await flushed;
    expect(saver.state).toBe('error');
    expect(saver.error).toBe('Cannot reach the NovelStudio server.');
    expect(saver.unsavedContent()).toEqual(doc('precious'));

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ text: 'precious', rev: 0 });
    calls[1]!.resolve({ rev: 1, wordCount: 1 });
    await settle();
    expect(saver.state).toBe('saved');
    expect(saver.error).toBeNull();
  });

  it('does not retry a failure the server will keep refusing', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport, retryMs: 1000 });
    saver.update(doc('x'));
    const flushed = saver.flush();
    await settle();
    calls[0]!.reject(new SaveError('failed', 'Invalid content', false));
    await flushed;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
    expect(saver.state).toBe('error');
  });

  it('asks for a keepalive request when the page is going away', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    saver.update(doc('bye'));
    void saver.flush({ keepalive: true });
    await settle();
    expect(calls[0]!.keepalive).toBe(true);
  });

  it('reset adopts the server revision and drops local text', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    saver.update(doc('local'));
    saver.reset(9);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(0);
    expect(saver).toMatchObject({ rev: 9, state: 'saved' });
  });

  it('does nothing when there is nothing to save', async () => {
    const { calls, transport } = manualTransport();
    const saver = new SectionSaver('n1', 0, { transport });
    await saver.flush();
    expect(calls).toHaveLength(0);
    expect(saver.state).toBe('saved');
  });
});

describe('SaverRegistry', () => {
  it('keeps one saver per section and aggregates the status for the top bar', async () => {
    const { calls, transport } = manualTransport();
    const registry = new SaverRegistry({ transport });
    const seen: string[] = [];
    registry.subscribe(() => seen.push(registry.status().kind));

    const a = registry.getOrCreate('a', 0);
    const b = registry.getOrCreate('b', 0);
    expect(registry.getOrCreate('a', 7)).toBe(a);
    expect(registry.status()).toEqual({ kind: 'saved' });

    a.update(doc('A'));
    expect(registry.status()).toEqual({ kind: 'saving' });
    const flushA = a.flush();
    b.update(doc('B'));
    await settle();
    calls[0]!.resolve({ rev: 1, wordCount: 1 });
    await flushA;
    expect(registry.status()).toEqual({ kind: 'saving' });

    const flushB = b.flush();
    await settle();
    calls[1]!.reject(new SaveError('failed', 'down'));
    await flushB;
    expect(registry.status()).toEqual({ kind: 'error', message: 'down' });

    await vi.advanceTimersByTimeAsync(5000);
    calls[2]!.reject(new SaveError('stale', 'conflict'));
    await settle();
    expect(registry.status()).toEqual({ kind: 'stale' });
    expect(seen).toContain('stale');

    registry.drop('b');
    expect(registry.status()).toEqual({ kind: 'saved' });
  });

  it('flushAll sends every section with unsaved text and reports saved sections', async () => {
    const { calls, transport } = manualTransport();
    const saved: string[] = [];
    const registry = new SaverRegistry({ transport });
    registry.onSaved((id) => saved.push(id));
    registry.getOrCreate('a', 0).update(doc('A'));
    registry.getOrCreate('b', 0).update(doc('B'));
    const all = registry.flushAll({ keepalive: true });
    await settle();
    expect(calls.map((c) => [c.nodeId, c.keepalive])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    calls.forEach((c, i) => c.resolve({ rev: 1, wordCount: i }));
    await all;
    expect(saved).toEqual(['a', 'b']);
  });
});

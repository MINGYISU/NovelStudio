import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMapData, type MapData } from '../../../shared/schemas/map.ts';
import { mapSavers, MapSaver, trackMapSaver, type MapSaveTransport } from './map-saver.ts';

const withTitle = (title: string): MapData => ({
  ...emptyMapData(),
  nodes: [
    {
      id: 'n',
      position: { x: 0, y: 0 },
      data: { title, description: '', color: '#112233', storyTime: '', links: [] },
    },
  ],
});

interface Call {
  title: string;
  keepalive: boolean;
  resolve: () => void;
  reject: (e: unknown) => void;
}

function manualTransport() {
  const calls: Call[] = [];
  const transport: MapSaveTransport = {
    save: (_id, data, options) =>
      new Promise<void>((resolve, reject) => {
        calls.push({
          title: data.nodes[0]?.data.title ?? '',
          keepalive: options.keepalive,
          resolve,
          reject,
        });
      }),
  };
  return { calls, transport };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('MapSaver', () => {
  it('saves once after changes stop and sends only the newest data', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('a'));
    await vi.advanceTimersByTimeAsync(700);
    saver.update(withTitle('ab'));
    await vi.advanceTimersByTimeAsync(700);
    expect(calls).toHaveLength(0);
    expect(saver.state).toBe('dirty');

    await vi.advanceTimersByTimeAsync(100);
    expect(calls.map((c) => c.title)).toEqual(['ab']);
    expect(saver.state).toBe('saving');
    calls[0]!.resolve();
    await settle();
    expect(saver.state).toBe('saved');
    expect(saver.hasUnsaved()).toBe(false);
  });

  it('never has two requests in flight and sends changes made meanwhile afterwards', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('one'));
    await vi.advanceTimersByTimeAsync(800);
    saver.update(withTitle('two'));
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(1);

    calls[0]!.resolve();
    await settle();
    expect(calls.map((c) => c.title)).toEqual(['one', 'two']);
    calls[1]!.resolve();
    await settle();
    expect(saver.state).toBe('saved');
  });

  it('flush sends right away, and a keepalive flush asks for a keepalive request', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('x'));
    const done = saver.flush({ keepalive: true });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.keepalive).toBe(true);
    calls[0]!.resolve();
    await done;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
  });

  it('keeps the data after a failure and retries until it is saved', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('keep'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('offline'));
    await settle();
    expect(saver.state).toBe('error');
    expect(saver.error).toBe('offline');
    expect(saver.hasUnsaved()).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.title).toBe('keep');
    calls[1]!.resolve();
    await settle();
    expect(saver.state).toBe('saved');
  });

  it('does not retry an answer that would fail again, but the next change tries again', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('a'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(Object.assign(new Error('read-only'), { retryable: false }));
    await settle();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toHaveLength(1);
    expect(saver.state).toBe('error');

    saver.update(withTitle('b'));
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(2);
  });

  it('dispose cancels a pending timer but flush still saves what is unsaved', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('m1', { transport });
    saver.update(withTitle('late'));
    void saver.flush();
    saver.dispose();
    await settle();
    expect(calls.map((c) => c.title)).toEqual(['late']);
  });
});

describe('trackMapSaver / mapSavers (ED-12)', () => {
  it('lists an open map, and a closed one until its data is saved', async () => {
    const { calls, transport } = manualTransport();
    const saver = new MapSaver('tracked', { transport });
    const release = trackMapSaver(saver);
    expect(mapSavers()).toContain(saver);

    saver.update(withTitle('x'));
    release();
    expect(mapSavers()).toContain(saver);
    void saver.flush();
    await settle();
    calls[0]!.resolve();
    await settle();
    expect(mapSavers()).not.toContain(saver);
  });

  it('keeps a remounted map listed when the old release arrives late (StrictMode)', () => {
    const { transport } = manualTransport();
    const saver = new MapSaver('remounted', { transport });
    const first = trackMapSaver(saver);
    const second = trackMapSaver(saver);
    first();
    first();
    expect(mapSavers()).toContain(saver);
    second();
    expect(mapSavers()).not.toContain(saver);
  });
});

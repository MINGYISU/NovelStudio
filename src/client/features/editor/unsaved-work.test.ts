import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMapData } from '../../../shared/schemas/map.ts';
import type { ContentDoc } from '../../../shared/schemas/content.ts';
import { MapSaver } from '../maps/map-saver.ts';
import { SaveError, SaverRegistry, type SaveResult } from './autosave.ts';
import { hasUnsavedWork } from './unsaved-work.ts';

const doc: ContentDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const settle = () => vi.advanceTimersByTimeAsync(0);

/** A registry and a map saver whose requests the test answers by hand. */
function setup() {
  const sectionCalls: { resolve: (r: SaveResult) => void; reject: (e: unknown) => void }[] = [];
  const registry = new SaverRegistry({
    transport: {
      save: () => new Promise((resolve, reject) => sectionCalls.push({ resolve, reject })),
    },
  });
  const mapCalls: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const map = new MapSaver('m1', {
    transport: { save: () => new Promise((resolve, reject) => mapCalls.push({ resolve, reject })) },
  });
  const unsaved = () => hasUnsavedWork(registry.all(), [map]);
  return { registry, map, sectionCalls, mapCalls, unsaved };
}

describe('hasUnsavedWork (ED-12)', () => {
  it('is false when everything is saved, including savers that were never used', () => {
    const { registry, unsaved } = setup();
    registry.getOrCreate('a', 0);
    expect(unsaved()).toBe(false);
    expect(hasUnsavedWork([], [])).toBe(false);
  });

  it('is true while a section has changes, is saving, failed or is stale', async () => {
    const { registry, sectionCalls, unsaved } = setup();
    const saver = registry.getOrCreate('a', 0);

    saver.update(doc);
    expect(saver.state).toBe('dirty');
    expect(unsaved()).toBe(true);

    void saver.flush();
    await settle();
    expect(saver.state).toBe('saving');
    expect(unsaved()).toBe(true);

    sectionCalls[0]!.reject(new SaveError('failed', 'Refused', false));
    await settle();
    expect(saver.state).toBe('error');
    expect(unsaved()).toBe(true);

    void saver.flush();
    await settle();
    sectionCalls[1]!.reject(new SaveError('stale', 'Changed elsewhere'));
    await settle();
    expect(saver.state).toBe('stale');
    expect(unsaved()).toBe(true);

    saver.reset(3);
    expect(unsaved()).toBe(false);
  });

  it('is false again once a save succeeds', async () => {
    const { registry, sectionCalls, unsaved } = setup();
    const saver = registry.getOrCreate('a', 0);
    saver.update(doc);
    void saver.flush();
    await settle();
    sectionCalls[0]!.resolve({ rev: 1, wordCount: 0 });
    await settle();
    expect(unsaved()).toBe(false);
  });

  it('is true while a map has changes, is saving or failed', async () => {
    const { map, mapCalls, unsaved } = setup();
    map.update(emptyMapData());
    expect(unsaved()).toBe(true);
    void map.flush();
    await settle();
    expect(unsaved()).toBe(true);
    mapCalls[0]!.reject(Object.assign(new Error('down'), { retryable: false }));
    await settle();
    expect(map.state).toBe('error');
    expect(unsaved()).toBe(true);

    map.update(emptyMapData());
    void map.flush();
    await settle();
    mapCalls[1]!.resolve();
    await settle();
    expect(unsaved()).toBe(false);
  });
});

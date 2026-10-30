import { describe, expect, it } from 'vitest';
import { formatBytes, needsOptimizing, targetSize } from './image-sizing.ts';

const base = { width: 1000, height: 800, bytes: 500_000, mime: 'image/png', animated: false };

describe('needsOptimizing', () => {
  it.each([
    ['small and light', base, false],
    ['long edge exactly 2400', { ...base, width: 2400 }, false],
    ['long edge over 2400', { ...base, width: 2401 }, true],
    ['tall image over 2400', { ...base, height: 3000 }, true],
    ['exactly 1.5 MB', { ...base, bytes: 1.5 * 1024 * 1024 }, false],
    ['over 1.5 MB', { ...base, bytes: 1.5 * 1024 * 1024 + 1 }, true],
    ['huge GIF', { ...base, mime: 'image/gif', width: 5000, bytes: 9e6 }, false],
    ['animated', { ...base, width: 5000, animated: true }, false],
  ])('%s', (_name, facts, expected) => {
    expect(needsOptimizing(facts)).toBe(expected);
  });
});

describe('targetSize', () => {
  it.each([
    [4000, 3000, { width: 2400, height: 1800 }],
    [3000, 4000, { width: 1800, height: 2400 }],
    [2400, 100, { width: 2400, height: 100 }],
    [800, 600, { width: 800, height: 600 }],
    [10000, 1, { width: 2400, height: 1 }],
  ])('%i x %i', (w, h, expected) => {
    expect(targetSize(w, h)).toEqual(expected);
  });

  it('honors a custom maximum and never enlarges', () => {
    expect(targetSize(1000, 500, 500)).toEqual({ width: 500, height: 250 });
    expect(targetSize(100, 50, 500)).toEqual({ width: 100, height: 50 });
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [2048, '2 KB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [250 * 1024 * 1024, '250 MB'],
    [2 * 1024 ** 3, '2.0 GB'],
  ])('%d', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

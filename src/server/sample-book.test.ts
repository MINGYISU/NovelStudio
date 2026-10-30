import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertTreeInvariants } from '../shared/tree.ts';
import { openDataStore, type DataStore } from './bootstrap.ts';
import { listBooks } from './repos/books.ts';
import { listNodes } from './repos/nodes.ts';
import { LibraryService } from './services/library.ts';
import { ManuscriptService } from './services/manuscript.ts';
import { SAMPLE_BOOK_TITLE, seedSampleBooks } from './services/sample-book.ts';

let tmp: string;
let store: DataStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-seed-'));
  fs.mkdirSync(path.join(tmp, 'home'));
  store = openDataStore({
    env: { NODE_ENV: 'test', NOVEL_DATA_DIR: path.join(tmp, 'data') },
    homedir: path.join(tmp, 'home'),
  });
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('seedSampleBooks', () => {
  it('creates a valid ~200 section book and does nothing the second time', () => {
    const library = new LibraryService(store.db, store.paths);
    const manuscript = new ManuscriptService(store.db, library, store.paths);
    expect(seedSampleBooks(store.db, library, manuscript).created).toBe(true);
    expect(seedSampleBooks(store.db, library, manuscript).created).toBe(false);

    const books = listBooks(store.db, { trashed: false, sort: 'title' });
    expect(books).toHaveLength(2);
    const sample = books.find((b) => b.title === SAMPLE_BOOK_TITLE)!;
    const nodes = listNodes(store.db, sample.id);
    expect(nodes.length).toBeGreaterThanOrEqual(180);
    expect(nodes.length).toBeLessThanOrEqual(230);
    expect(() => assertTreeInvariants(nodes)).not.toThrow();
    expect(sample.wordCount).toBeGreaterThan(0);
  });
});

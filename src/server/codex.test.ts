import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CodexCategory, CodexData, CodexEntry } from '../shared/schemas/codex.ts';
import { Harness, multipartBody, TINY_PNG } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

async function seeded(title = 'Codex Book') {
  const book = await h.createBook(title);
  const res = await h.api('POST', `/api/books/${book.id}/codex/seed`);
  expect(res.statusCode).toBe(200);
  return { book, categories: res.json<{ categories: CodexCategory[] }>().categories };
}

async function addEntry(bookId: string, categoryId: string, title: string, summary?: string) {
  const res = await h.api('POST', `/api/books/${bookId}/codex/entries`, {
    categoryId,
    title,
    summary,
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ entry: CodexEntry }>().entry;
}

async function codex(bookId: string): Promise<CodexData> {
  return (await h.api('GET', `/api/books/${bookId}/codex`)).json<CodexData>();
}

async function uploadImage(bookId: string): Promise<{ id: string; url: string }> {
  const form = multipartBody([{ name: 'file', filename: 'portrait.png', data: TINY_PNG }]);
  const res = await h.app.inject({ method: 'POST', url: `/api/books/${bookId}/assets`, ...form });
  expect(res.statusCode).toBe(201);
  return res.json();
}

const assetFiles = (bookId: string) => {
  const dir = path.join(h.store.paths.assetsDir, bookId);
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

describe('default categories (CDX-01..03)', () => {
  it('a book starts with no categories and seeding creates the eight defaults once', async () => {
    const book = await h.createBook();
    expect((await codex(book.id)).categories).toEqual([]);

    const first = (await h.api('POST', `/api/books/${book.id}/codex/seed`)).json<{
      categories: CodexCategory[];
    }>();
    expect(first.categories.map((c) => c.name)).toEqual([
      'Characters',
      'Locations',
      'Era & Timeline',
      'Culture & Traditions',
      'Organizations',
      'Creatures & Species',
      'Rules & Concepts',
      'Other',
    ]);
    expect(first.categories.map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(first.categories[0]!.fieldTemplate.map((f) => f.label)).toEqual([
      'Name',
      'Aliases',
      'Role',
      'Age',
      'Appearance',
      'Background',
      'Personality',
      'Goals & Motivation',
      'Relationships',
      'Arc notes',
      'Notes',
    ]);
    expect(first.categories[1]!.fieldTemplate.map((f) => f.label)).toEqual([
      'Description',
      'Notes',
    ]);

    const second = (await h.api('POST', `/api/books/${book.id}/codex/seed`)).json<{
      categories: CodexCategory[];
    }>();
    expect(second.categories.map((c) => c.id)).toEqual(first.categories.map((c) => c.id));
    expect((await codex(book.id)).categories).toHaveLength(8);
  });

  it('does not seed a book that already has categories, however few', async () => {
    const book = await h.createBook();
    await h.api('POST', `/api/books/${book.id}/codex/categories`, { name: 'Magic' });
    const res = await h.api('POST', `/api/books/${book.id}/codex/seed`);
    expect(res.json<{ categories: CodexCategory[] }>().categories.map((c) => c.name)).toEqual([
      'Magic',
    ]);
  });

  it('seeding a trashed or unknown book fails and writes nothing', async () => {
    const book = await h.createBook();
    await h.api('DELETE', `/api/books/${book.id}`);
    expect((await h.api('POST', `/api/books/${book.id}/codex/seed`)).statusCode).toBe(409);
    expect((await codex(book.id)).categories).toEqual([]);
    expect((await h.api('POST', `/api/books/${MISSING}/codex/seed`)).statusCode).toBe(404);
  });
});

describe('categories', () => {
  it('adds, renames and reorders categories keeping positions contiguous', async () => {
    const { book, categories } = await seeded();
    const added = (
      await h.api('POST', `/api/books/${book.id}/codex/categories`, { name: '  Magic  ' })
    ).json<{ category: CodexCategory }>().category;
    expect(added.name).toBe('Magic');
    expect(added.position).toBe(8);
    expect(added.fieldTemplate.map((f) => f.key)).toEqual(['description', 'notes']);

    const renamed = await h.api('PATCH', `/api/codex/categories/${added.id}`, { name: 'Spells' });
    expect(renamed.json<{ category: CodexCategory }>().category.name).toBe('Spells');

    const moved = await h.api('POST', `/api/codex/categories/${added.id}/move`, { index: 1 });
    const order = moved.json<{ categories: CodexCategory[] }>().categories;
    expect(order.map((c) => c.name).slice(0, 3)).toEqual(['Characters', 'Spells', 'Locations']);
    expect(order.map((c) => c.position)).toEqual(order.map((_, i) => i));
    expect(categories).toHaveLength(8);

    const tooFar = await h.api('POST', `/api/codex/categories/${added.id}/move`, { index: 99 });
    expect(tooFar.statusCode).toBe(400);
    expect(tooFar.json().error.code).toBe('INVALID_INDEX');
  });

  it('rejects empty names and invalid templates', async () => {
    const { book, categories } = await seeded();
    const post = (body: object) => h.api('POST', `/api/books/${book.id}/codex/categories`, body);
    expect((await post({ name: '   ' })).statusCode).toBe(400);
    const dup = [
      { key: 'a', label: 'A', type: 'text' },
      { key: 'a', label: 'B', type: 'text' },
    ];
    expect((await post({ name: 'X', fieldTemplate: dup })).statusCode).toBe(400);
    expect(
      (await h.api('PATCH', `/api/codex/categories/${categories[0]!.id}`, {})).statusCode,
    ).toBe(400);
  });

  it('a category with entries cannot be deleted; an empty one can', async () => {
    const { book, categories } = await seeded();
    const [characters, locations] = categories as [CodexCategory, CodexCategory];
    await addEntry(book.id, characters.id, 'Lin Yao');

    const refused = await h.api('DELETE', `/api/codex/categories/${characters.id}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('CATEGORY_NOT_EMPTY');
    expect((await codex(book.id)).categories).toHaveLength(8);
    expect((await codex(book.id)).entries).toHaveLength(1);

    const deleted = await h.api('DELETE', `/api/codex/categories/${locations.id}`);
    expect(deleted.statusCode).toBe(200);
    const rest = deleted.json<{ categories: CodexCategory[] }>().categories;
    expect(rest).toHaveLength(7);
    expect(rest.map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('a category becomes deletable again once its last entry is deleted', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    expect((await h.api('DELETE', `/api/codex/categories/${categories[0]!.id}`)).statusCode).toBe(
      409,
    );
    await h.api('DELETE', `/api/codex/entries/${entry.id}`);
    expect((await h.api('DELETE', `/api/codex/categories/${categories[0]!.id}`)).statusCode).toBe(
      200,
    );
  });
});

describe('entries', () => {
  it('a new entry copies the category template with empty values', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, '  Lin Yao  ', 'A courier');
    expect(entry.title).toBe('Lin Yao');
    expect(entry.summary).toBe('A courier');
    expect(entry.fields).toHaveLength(11);
    expect(entry.fields.every((f) => f.value === '')).toBe(true);
    expect(entry.imageAssetId).toBeNull();
    expect(entry.position).toBe(0);
    expect((await addEntry(book.id, categories[0]!.id, 'Mo Han')).position).toBe(1);
  });

  it('editing the category template affects new entries only (CDX-04)', async () => {
    const { book, categories } = await seeded();
    const category = categories[1]!;
    const before = await addEntry(book.id, category.id, 'Harbour');

    const template = [
      { key: 'description', label: 'Description', type: 'longtext' },
      { key: 'climate', label: 'Climate', type: 'text' },
    ];
    const patched = await h.api('PATCH', `/api/codex/categories/${category.id}`, {
      fieldTemplate: template,
    });
    expect(patched.statusCode).toBe(200);

    const after = await addEntry(book.id, category.id, 'Hills');
    expect(after.fields.map((f) => f.key)).toEqual(['description', 'climate']);
    const stored = (await codex(book.id)).entries.find((e) => e.id === before.id)!;
    expect(stored.fields.map((f) => f.key)).toEqual(['description', 'notes']);
  });

  it('adds, renames, reorders and removes fields, and they survive a restart', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[1]!.id, 'Harbour Gate');

    const fields = [
      { key: 'notes', label: 'Private notes', type: 'longtext', value: 'Check the tide.' },
      { key: 'description', label: 'Description', type: 'longtext', value: 'A stone arch.' },
      { key: 'f-1a2b3c4d', label: 'Opening hours', type: 'text', value: 'Dawn to dusk' },
    ];
    const res = await h.api('PATCH', `/api/codex/entries/${entry.id}`, {
      title: 'Harbour Gate (old)',
      summary: 'Where it begins',
      fields,
    });
    expect(res.statusCode).toBe(200);

    await h.restart();
    const stored = (await codex(book.id)).entries.find((e) => e.id === entry.id)!;
    expect(stored.title).toBe('Harbour Gate (old)');
    expect(stored.summary).toBe('Where it begins');
    expect(stored.fields).toEqual(fields);

    // Remove one again: only what was sent remains.
    await h.api('PATCH', `/api/codex/entries/${entry.id}`, { fields: fields.slice(1) });
    await h.restart();
    const after = (await codex(book.id)).entries.find((e) => e.id === entry.id)!;
    expect(after.fields.map((f) => f.key)).toEqual(['description', 'f-1a2b3c4d']);
  });

  it('rejects invalid patches without changing anything', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    const patch = (body: object) => h.api('PATCH', `/api/codex/entries/${entry.id}`, body);
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ title: '  ' })).statusCode).toBe(400);
    const bad = { key: 'Bad Key', label: 'L', type: 'text', value: '' };
    expect((await patch({ fields: [bad] })).statusCode).toBe(400);
    const wrongType = { key: 'a', label: 'L', type: 'date', value: '' };
    expect((await patch({ fields: [wrongType] })).statusCode).toBe(400);
    expect((await codex(book.id)).entries[0]!.title).toBe('Lin Yao');
    expect((await h.api('PATCH', `/api/codex/entries/${MISSING}`, { title: 'x' })).statusCode).toBe(
      404,
    );
  });

  it('refuses a category from another book', async () => {
    const one = await seeded('One');
    const two = await seeded('Two');
    const res = await h.api('POST', `/api/books/${one.book.id}/codex/entries`, {
      categoryId: two.categories[0]!.id,
      title: 'Stray',
    });
    expect(res.statusCode).toBe(404);
    expect((await codex(one.book.id)).entries).toEqual([]);
    expect((await codex(two.book.id)).entries).toEqual([]);
  });

  it('reorders entries inside their category and closes the gap on delete', async () => {
    const { book, categories } = await seeded();
    const cat = categories[0]!.id;
    const [a, b, c] = [
      await addEntry(book.id, cat, 'A'),
      await addEntry(book.id, cat, 'B'),
      await addEntry(book.id, cat, 'C'),
    ];
    const moved = await h.api('POST', `/api/codex/entries/${c.id}/move`, { index: 0 });
    expect(moved.json<{ entries: CodexEntry[] }>().entries.map((e) => e.title)).toEqual([
      'C',
      'A',
      'B',
    ]);
    expect((await h.api('POST', `/api/codex/entries/${c.id}/move`, { index: 3 })).statusCode).toBe(
      400,
    );

    const deleted = await h.api('DELETE', `/api/codex/entries/${a.id}`);
    const rest = deleted.json<{ entries: CodexEntry[] }>().entries;
    expect(rest.map((e) => [e.title, e.position])).toEqual([
      ['C', 0],
      ['B', 1],
    ]);
    expect(b.position).toBe(1);
  });
});

describe('entry images (CDX-06)', () => {
  it('sets, replaces and removes an image, deleting the abandoned asset', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    const first = await uploadImage(book.id);
    const second = await uploadImage(book.id);
    expect(assetFiles(book.id)).toHaveLength(2);

    const set = await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId: first.id });
    expect(set.json<{ entry: CodexEntry }>().entry.imageUrl).toBe(first.url);

    await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId: second.id });
    expect(assetFiles(book.id)).toHaveLength(1);
    expect(
      (await h.app.inject({ method: 'GET', url: first.url, headers: { host: '127.0.0.1:4317' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await h.app.inject({ method: 'GET', url: second.url, headers: { host: '127.0.0.1:4317' } }))
        .statusCode,
    ).toBe(200);

    const cleared = await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId: null });
    expect(cleared.json<{ entry: CodexEntry }>().entry.imageUrl).toBeNull();
    expect(assetFiles(book.id)).toHaveLength(0);
  });

  it('deleting an entry removes its image; an image used as the cover stays', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    const image = await uploadImage(book.id);
    await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId: image.id });
    await h.api('DELETE', `/api/codex/entries/${entry.id}`);
    expect(assetFiles(book.id)).toHaveLength(0);

    const other = await addEntry(book.id, categories[0]!.id, 'Mo Han');
    const shared = await uploadImage(book.id);
    await h.api('PATCH', `/api/books/${book.id}`, { coverAssetId: shared.id });
    await h.api('PATCH', `/api/codex/entries/${other.id}`, { imageAssetId: shared.id });
    await h.api('PATCH', `/api/codex/entries/${other.id}`, { imageAssetId: null });
    expect(assetFiles(book.id)).toHaveLength(1);
  });

  it('refuses an image from another book or one that does not exist', async () => {
    const one = await seeded('One');
    const two = await seeded('Two');
    const entry = await addEntry(one.book.id, one.categories[0]!.id, 'Lin Yao');
    const foreign = await uploadImage(two.book.id);
    for (const imageAssetId of [foreign.id, MISSING]) {
      const res = await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_IMAGE');
    }
    expect((await codex(one.book.id)).entries[0]!.imageAssetId).toBeNull();
    expect(assetFiles(two.book.id)).toHaveLength(1);
  });
});

describe('trashed books and purge', () => {
  it('reads stay possible but every write is BOOK_TRASHED', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    await h.api('DELETE', `/api/books/${book.id}`);

    expect((await codex(book.id)).entries).toHaveLength(1);
    const writes = [
      h.api('POST', `/api/books/${book.id}/codex/categories`, { name: 'X' }),
      h.api('PATCH', `/api/codex/categories/${categories[0]!.id}`, { name: 'X' }),
      h.api('POST', `/api/codex/categories/${categories[1]!.id}/move`, { index: 0 }),
      h.api('DELETE', `/api/codex/categories/${categories[1]!.id}`),
      h.api('POST', `/api/books/${book.id}/codex/entries`, {
        categoryId: categories[0]!.id,
        title: 'New',
      }),
      h.api('PATCH', `/api/codex/entries/${entry.id}`, { title: 'X' }),
      h.api('POST', `/api/codex/entries/${entry.id}/move`, { index: 0 }),
      h.api('DELETE', `/api/codex/entries/${entry.id}`),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('BOOK_TRASHED');
    }
    expect((await codex(book.id)).entries[0]!.title).toBe('Lin Yao');
  });

  it('purging a book removes its codex with it', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[0]!.id, 'Lin Yao');
    const image = await uploadImage(book.id);
    await h.api('PATCH', `/api/codex/entries/${entry.id}`, { imageAssetId: image.id });
    await h.api('DELETE', `/api/books/${book.id}`);

    const purge = await h.api(
      'DELETE',
      `/api/books/${book.id}?purge=1&confirmTitle=${encodeURIComponent(book.title)}`,
    );
    expect(purge.statusCode).toBe(204);
    const count = (table: string) =>
      (h.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('codex_categories')).toBe(0);
    expect(count('codex_entries')).toBe(0);
  });
});

describe('stored data safety', () => {
  it('a damaged JSON column does not hide the readable fields or break the API', async () => {
    const { book, categories } = await seeded();
    const entry = await addEntry(book.id, categories[1]!.id, 'Harbour');
    const good = { key: 'description', label: 'Description', type: 'longtext', value: 'Kept' };
    h.store.db
      .prepare('UPDATE codex_entries SET fields = ? WHERE id = ?')
      .run(JSON.stringify([good, { key: 'broken' }, 'nonsense', good]), entry.id);
    h.store.db
      .prepare('UPDATE codex_categories SET field_template = ? WHERE id = ?')
      .run('not json', categories[2]!.id);

    const data = await codex(book.id);
    expect(data.entries[0]!.fields).toEqual([good]);
    expect(data.categories[2]!.fieldTemplate).toEqual([]);
  });
});

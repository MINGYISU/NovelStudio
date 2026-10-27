import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { editorOf, openSection, seedBook, seedText } from './helpers.ts';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Category {
  id: string;
  name: string;
}

async function seedCodex(request: APIRequestContext, bookId: string): Promise<Category[]> {
  const res = await request.post(`/api/books/${bookId}/codex/seed`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { categories: Category[] }).categories;
}

async function addEntry(
  request: APIRequestContext,
  bookId: string,
  categoryId: string,
  title: string,
  extra: { summary?: string; fields?: object[] } = {},
): Promise<string> {
  const created = await request.post(`/api/books/${bookId}/codex/entries`, {
    data: { categoryId, title, summary: extra.summary },
  });
  expect(created.ok()).toBe(true);
  const entry = ((await created.json()) as { entry: { id: string } }).entry;
  if (extra.fields) {
    const patched = await request.patch(`/api/codex/entries/${entry.id}`, {
      data: { fields: extra.fields },
    });
    expect(patched.ok()).toBe(true);
  }
  return entry.id;
}

const field = (key: string, label: string, value: string, type = 'text') => ({
  key,
  label,
  type,
  value,
});

async function storedEntry(request: APIRequestContext, bookId: string, title: string) {
  const res = await request.get(`/api/books/${bookId}/codex`);
  const data = (await res.json()) as {
    entries: {
      id: string;
      title: string;
      fields: { key: string; label: string; value: string }[];
    }[];
  };
  return data.entries.find((e) => e.title === title);
}

async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('entry-status')).toHaveText('Saved');
}

test.describe('codex', () => {
  test('a new entry gets the default fields, and a custom field persists after a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex fields', async () => {});
    await page.goto(`/book/${book.id}/codex`);

    // A new book comes with the eight default categories (CDX-01).
    await expect(page.getByRole('button', { name: /^Characters/ })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Codex categories' }).getByRole('button'),
    ).toHaveCount(8 + 8 + 1);

    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByLabel('New entry title').fill('Lin Yao');
    await page.getByLabel('New entry title').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/codex/[0-9a-f-]{36}$`));
    await expect(page.getByLabel('Entry title')).toHaveValue('Lin Yao');
    await expect(page.getByRole('list', { name: 'Fields' }).getByRole('listitem')).toHaveCount(11);

    await page.getByLabel('New field name').fill('Favourite tea');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByLabel('Favourite tea', { exact: true }).fill('Jasmine');
    await page.getByLabel('Entry title').fill('Lin Yao (courier)');
    await waitSaved(page);

    await page.reload();
    await expect(page.getByLabel('Entry title')).toHaveValue('Lin Yao (courier)');
    await expect(page.getByLabel('Favourite tea', { exact: true })).toHaveValue('Jasmine');
    await expect(page.getByRole('list', { name: 'Fields' }).getByRole('listitem')).toHaveCount(12);

    const stored = await storedEntry(request, book.id, 'Lin Yao (courier)');
    expect(stored?.fields.at(-1)).toMatchObject({ label: 'Favourite tea', value: 'Jasmine' });
  });

  test('fields can be renamed, reordered and removed, and typing right before leaving is not lost', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex field edits', async () => {});
    const [, locations] = await seedCodex(request, book.id);
    const id = await addEntry(request, book.id, locations!.id, 'Harbour Gate', {
      fields: [
        field('description', 'Description', 'A stone arch.', 'longtext'),
        field('notes', 'Notes', 'Check the tide.', 'longtext'),
        field('hours', 'Hours', 'Dawn to dusk'),
      ],
    });
    await page.goto(`/book/${book.id}/codex/${id}`);

    await page.getByLabel('Name of field 3').fill('Opening hours');
    await page.getByRole('button', { name: 'Move Opening hours up' }).click();
    await page.getByRole('button', { name: 'Remove Description' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await waitSaved(page);

    // Type and leave straight away: the pending text is saved on the way out.
    await page.getByLabel('Notes', { exact: true }).fill('Check the tide twice.');
    await page.getByRole('link', { name: 'Locations' }).click();
    await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible();

    await expect
      .poll(async () => (await storedEntry(request, book.id, 'Harbour Gate'))?.fields)
      .toEqual([
        field('hours', 'Opening hours', 'Dawn to dusk'),
        field('notes', 'Notes', 'Check the tide twice.', 'longtext'),
      ]);
  });

  test('a category with entries cannot be deleted; an empty one can', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E codex categories', async () => {});
    const categories = await seedCodex(request, book.id);
    await addEntry(request, book.id, categories[0]!.id, 'Lin Yao');
    await page.goto(`/book/${book.id}/codex`);

    await page.getByRole('button', { name: 'Category menu: Characters' }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete category' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText('Only empty categories can be deleted.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Category menu: Other' }).click();
    await page.getByRole('menuitem', { name: 'Delete category' }).click();
    await expect(page.getByRole('button', { name: 'Category menu: Other' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Category menu: Characters' })).toBeVisible();

    const res = await request.get(`/api/books/${book.id}/codex`);
    const data = (await res.json()) as { categories: Category[] };
    expect(data.categories.map((c) => c.name)).not.toContain('Other');
    expect(data.categories.map((c) => c.name)).toContain('Characters');
  });

  test('categories can be added, renamed and reordered', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E codex category edits', async () => {});
    await page.goto(`/book/${book.id}/codex`);
    await expect(page.getByRole('button', { name: /^Characters/ })).toBeVisible();

    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('New category name').fill('Magic');
    await page.getByLabel('New category name').press('Enter');
    await expect(page.getByRole('heading', { name: 'Magic' })).toBeVisible();

    await page.getByRole('button', { name: 'Category menu: Magic' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await page.getByRole('button', { name: 'Category menu: Magic' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const rename = page.getByLabel('Rename Magic');
    await rename.fill('Spells');
    await rename.press('Enter');

    await page.reload();
    await expect(page.getByTestId('category-name')).toHaveCount(9);
    const names = await page.getByTestId('category-name').allTextContents();
    expect(names.slice(0, 3)).toEqual(['Characters', 'Locations', 'Era & Timeline']);
    expect(names).toContain('Spells');
    expect(names).not.toContain('Magic');
    expect(names.indexOf('Spells')).toBe(names.length - 2);
  });

  test('editing a category template changes new entries only', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E codex template', async () => {});
    const [, locations] = await seedCodex(request, book.id);
    const oldId = await addEntry(request, book.id, locations!.id, 'Old Harbour');
    await page.goto(`/book/${book.id}/codex`);
    await page.getByRole('button', { name: /^Locations/ }).click();

    await page.getByRole('button', { name: 'Category menu: Locations' }).click();
    await page.getByRole('menuitem', { name: 'Edit field template…' }).click();
    await page.getByLabel('New template field name').fill('Climate');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByLabel('New entry title').fill('New Harbour');
    await page.getByLabel('New entry title').press('Enter');
    await expect(page.getByLabel('Climate', { exact: true })).toBeVisible();

    await page.goto(`/book/${book.id}/codex/${oldId}`);
    await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Climate', { exact: true })).toHaveCount(0);
  });

  test('search finds entries across categories and clears with Escape', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex search', async () => {});
    const categories = await seedCodex(request, book.id);
    await addEntry(request, book.id, categories[0]!.id, 'Lin Yao', {
      fields: [field('background', 'Background', 'Grew up by the harbour', 'longtext')],
    });
    await addEntry(request, book.id, categories[1]!.id, 'Harbour Gate', {
      summary: 'Where the road begins',
    });
    await addEntry(request, book.id, categories[0]!.id, 'Mo Han');
    await page.goto(`/book/${book.id}/codex`);

    const search = page.getByLabel('Search codex');
    await search.fill('harbour');
    const results = page.getByRole('list', { name: 'Search results' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    await expect(results.first()).toContainText('Harbour Gate');
    await expect(results.nth(1)).toContainText('Lin Yao');

    await search.fill('zebra');
    await expect(page.getByText('No entries match “zebra”.')).toBeVisible();

    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Characters', level: 2 })).toBeVisible();
  });

  test('an entry image can be added, survives a reload, and can be removed', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex image', async () => {});
    const categories = await seedCodex(request, book.id);
    const id = await addEntry(request, book.id, categories[0]!.id, 'Lin Yao');
    await page.goto(`/book/${book.id}/codex/${id}`);

    await page.getByLabel('Entry image file').setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    const image = page.getByRole('img', { name: 'Image of Lin Yao' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);

    await page.reload();
    await expect(page.getByRole('img', { name: 'Image of Lin Yao' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Image of Lin Yao' })).toHaveCount(0);

    await page.getByLabel('Entry image file').setInputFiles({
      name: 'notes.txt',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByText(/Only PNG, JPEG, WebP and GIF/)).toBeVisible();
  });

  test('an entry can be deleted after confirming', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E codex delete', async () => {});
    const categories = await seedCodex(request, book.id);
    const id = await addEntry(request, book.id, categories[0]!.id, 'Lin Yao');
    await page.goto(`/book/${book.id}/codex/${id}`);

    await page.getByRole('button', { name: 'Delete entry' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect(page).toHaveURL(new RegExp(`/codex$`));
    await expect(page.getByText('No entries in Characters yet.')).toBeVisible();
    expect(await storedEntry(request, book.id, 'Lin Yao')).toBeUndefined();
  });

  test('"Characters in this section" lists codex characters named in the text', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex characters', async (add) => {
      await add('c1', 'chapter', null, 'Arrival');
      await add('c2', 'chapter', null, 'Departure');
    });
    const categories = await seedCodex(request, book.id);
    const linId = await addEntry(request, book.id, categories[0]!.id, 'Lin Yao', {
      fields: [field('aliases', 'Aliases', 'Little Yao, 阿遥')],
    });
    await addEntry(request, book.id, categories[0]!.id, 'Mo Han');
    await addEntry(request, book.id, categories[1]!.id, 'Harbour Gate');
    await seedText(request, book.nodes.c1!.id, 'Little Yao reached the Harbour Gate at dawn.');

    await openSection(page, book.id, book.nodes.c1!.id);
    const panel = page.getByRole('region', { name: 'Characters in this section' });
    await expect(panel.getByRole('link', { name: 'Lin Yao' })).toBeVisible();
    await expect(panel.getByRole('link')).toHaveCount(1);

    await openSection(page, book.id, book.nodes.c2!.id);
    await expect(panel.getByText('No codex characters are named here.')).toBeVisible();

    // The list follows the text once it has been saved.
    await editorOf(page).click();
    await page.keyboard.type('Mo Han waited. 阿遥 did not.');
    await expect(panel.getByRole('link')).toHaveCount(2);
    await expect(panel.getByRole('link').first()).toContainText('Mo Han');

    await panel.getByRole('link', { name: 'Lin Yao' }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/${linId}$`));
    await expect(page.getByLabel('Entry title')).toHaveValue('Lin Yao');

    // The Manuscript tab returns to the section that was open.
    await page.getByRole('link', { name: 'Manuscript' }).click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${book.nodes.c2!.id}$`));
  });
});

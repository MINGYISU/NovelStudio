import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  editorOf,
  openBook,
  openSection,
  row,
  rows,
  savedText,
  seedBook,
  seedText,
  serverOrder,
  visibleTitles,
} from './helpers.ts';

// M9 review fixes (docs/ROADMAP.md). Made-up text only.

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');
/** The bottom quarter of a 30 px tree row means "after this row" (react-arborist drop zones). */
const BOTTOM_EDGE = { x: 60, y: 27 };

async function paste(page: Page, html: string): Promise<void> {
  await editorOf(page).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData('text/html', value);
    data.setData('text/plain', 'plain fallback');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, html);
}

/** Runs the editor's paste cleaner in the real browser (Vitest has no DOM). */
async function clean(page: Page, html: string): Promise<string> {
  return page.evaluate(async (value) => {
    const url = '/src/client/features/editor/paste.ts';
    const mod = (await import(/* @vite-ignore */ url)) as {
      cleanPastedHtml: (html: string) => string;
    };
    return mod.cleanPastedHtml(value);
  }, html);
}

function failSaves(page: Page) {
  return page.route('**/api/nodes/*/content', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'TEST', message: 'Saving is blocked by the test.' },
          }),
        })
      : route.continue(),
  );
}

async function categoryNames(request: APIRequestContext, bookId: string): Promise<string[]> {
  const res = await request.get(`/api/books/${bookId}/codex`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { categories: { name: string }[] }).categories.map((c) => c.name);
}

test.describe('M9 group A: no silent loss of text', () => {
  test('A1: a trashed chapter is restored from the Trash dialog after the notice is gone', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E trash list', async (add) => {
      await add('c1', 'chapter', null, 'Alpha');
      await add('c2', 'chapter', null, 'Beta');
      await add('c3', 'chapter', null, 'Gamma');
    });
    await seedText(request, book.nodes.c3!.id, 'Gamma keeps its words.');
    await openBook(page, book.id);
    const trashButton = page.getByRole('button', { name: /^Trash/ });
    await expect(page.getByTestId('trash-count')).toHaveCount(0);

    await row(page, 'Chapter 3').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Alpha', 'Beta']);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);
    await expect(page.getByTestId('trash-count')).toHaveText('1');

    await trashButton.click();
    const dialog = page.getByRole('dialog', { name: 'Trash' });
    await expect(dialog).toContainText('end of its original parent');
    const item = dialog.getByRole('listitem').filter({ hasText: 'Gamma' });
    await expect(item).toContainText('Chapter');
    await expect(item).toContainText('1 section');
    await expect(item).toContainText('4 words');
    await item.getByRole('button', { name: 'Restore' }).click();

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Alpha', 'Beta', 'Gamma']);
    await expect(page).toHaveURL(new RegExp(`/manuscript/${book.nodes.c3!.id}$`));
    await expect(page.getByRole('treeitem', { selected: true })).toContainText('Chapter 3 — Gamma');
    await expect(editorOf(page)).toContainText('Gamma keeps its words.');
    await expect(page.getByTestId('trash-count')).toHaveCount(0);
  });

  test('A2: pasting six nested quotes stays saveable and nothing is lost after a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E nested quotes', async (add) => {
      await add('c1', 'chapter', null, 'Thread');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.click();
    let html = '<p>Level six says hello.</p>';
    for (let level = 5; level >= 0; level--) {
      html = `<blockquote><p>Level ${level} writes.</p>${html}</blockquote>`;
    }
    await paste(page, html);
    await expect(editor.locator('blockquote blockquote')).toHaveCount(0);
    await page.keyboard.press('End');
    await page.keyboard.type(' And more typed after.');
    // `> ` inside a quote stays text and never wraps another quote.
    await page.keyboard.press('Enter');
    await page.keyboard.type('> not nested');
    await expect(editor.locator('blockquote blockquote')).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveText('Saved');

    await page.reload();
    await expect(editorOf(page)).toBeVisible();
    const text = await savedText(request, book.nodes.c1!.id);
    for (let level = 0; level <= 5; level++) expect(text).toContain(`Level ${level} writes.`);
    expect(text).toContain('Level six says hello. And more typed after.');
    expect(text).toContain('> not nested');
    await expect(editorOf(page)).toContainText('And more typed after.');
  });

  test('A2: a refused save shows a lasting banner with a copy button and keeps Error', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E refused save', async (add) => {
      await add('c1', 'chapter', null, 'Refused');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await page.route('**/api/nodes/*/content', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Content is nested too deeply.' },
        }),
      }),
    );
    await editor.click();
    await page.keyboard.type('Words the server refuses.');
    const banner = page.getByTestId('save-rejected');
    await expect(banner).toContainText('Content is nested too deeply.');
    await expect(page.getByTestId('save-status')).toContainText('Error');
    await page.keyboard.type(' More words.');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('save-status')).toContainText('Error');
    await expect(banner).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await banner.getByRole('button', { name: 'Copy section text' }).click();
    await expect(banner).toContainText('Copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'Words the server refuses. More words.',
    );

    await page.unroute('**/api/nodes/*/content');
    await page.keyboard.type(' Fixed.');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await expect(banner).toHaveCount(0);
  });

  test('A3: leaving the page asks first while a save is failing, and not when all is saved', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E leave page', async (add) => {
      await add('c1', 'chapter', null, 'Leaving');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.click();
    await page.keyboard.type('Saved before leaving.');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');

    // Everything saved: the page closes without a prompt.
    const calm = await page.context().newPage();
    const calmDialogs: string[] = [];
    calm.on('dialog', (d) => {
      calmDialogs.push(d.type());
      void d.dismiss();
    });
    await openSection(calm, book.id, book.nodes.c1!.id);
    await calm.close({ runBeforeUnload: true });
    await expect.poll(() => calm.isClosed()).toBe(true);
    expect(calmDialogs).toEqual([]);

    await failSaves(page);
    await page.keyboard.type(' Not saved yet.');
    await expect(page.getByTestId('save-status')).toContainText('Error');
    const dialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const prompt = await dialog;
    expect(prompt.type()).toBe('beforeunload');
    await prompt.dismiss();
    expect(page.isClosed()).toBe(false);
  });

  test('A5: restoring a snapshot over unsaved text warns; Cancel keeps it, Restore anyway restores', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E snapshot guard', async (add) => {
      await add('c1', 'chapter', null, 'Versions');
    });
    const id = book.nodes.c1!.id;
    await seedText(request, id, 'First version.');
    const second = await request.put(`/api/nodes/${id}/content`, {
      data: {
        rev: 1,
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second version.' }] }],
        },
      },
    });
    expect(second.ok()).toBe(true);

    const editor = await openSection(page, book.id, id);
    await failSaves(page);
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Unsaved tail.');
    await page.getByRole('button', { name: 'Snapshots' }).click();
    const dialog = page.getByRole('dialog', { name: 'Snapshots' });
    await dialog.getByRole('button', { name: /First version/ }).click();
    await dialog.getByRole('button', { name: 'Restore this version' }).click();

    const warning = dialog.getByRole('alertdialog', { name: 'Unsaved text' });
    await expect(warning).toContainText(
      'This section has text that is not saved. Restoring the snapshot will discard it.',
    );
    await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await warning.getByRole('button', { name: 'Cancel' }).click();
    await expect(warning).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(editorOf(page)).toContainText('Second version. Unsaved tail.');

    await page.getByRole('button', { name: 'Snapshots' }).click();
    await dialog.getByRole('button', { name: /First version/ }).click();
    await dialog.getByRole('button', { name: 'Restore this version' }).click();
    await dialog.getByRole('button', { name: 'Restore anyway' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editorOf(page)).toHaveText('First version.');
    expect(await savedText(request, id)).toBe('First version.');
  });

  test('A6: text typed just before trashing is saved first and comes back with a restore', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E trash flush', async (add) => {
      await add('c1', 'chapter', null, 'Keep');
      await add('c2', 'chapter', null, 'Hurried');
    });
    const editor = await openSection(page, book.id, book.nodes.c2!.id);
    await editor.click();
    await page.keyboard.type('Written in a hurry, the last words matter.');
    await row(page, 'Chapter 2').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Keep']);

    await page.getByRole('button', { name: /^Trash/ }).click();
    await page
      .getByRole('dialog', { name: 'Trash' })
      .getByRole('listitem')
      .filter({ hasText: 'Hurried' })
      .getByRole('button', { name: 'Restore' })
      .click();
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Keep', 'Hurried']);
    expect(await savedText(request, book.nodes.c2!.id)).toBe(
      'Written in a hurry, the last words matter.',
    );
    await expect(editorOf(page)).toContainText('the last words matter.');
  });

  test('A6: a section whose text cannot be saved is not trashed', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E trash refused', async (add) => {
      await add('c1', 'chapter', null, 'Stuck');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await failSaves(page);
    await editor.click();
    await page.keyboard.type('Cannot be saved.');
    await row(page, 'Chapter 1').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'not moved to the trash' })).toHaveText(
      /Could not save the latest text, so the section was not moved to the trash\./,
    );
    expect(await serverOrder(request, book.id)).toEqual(['Stuck']);
  });
});

test.describe('M9 group B: correctness', () => {
  test('B1/B2: the paste cleaner unwraps Google Docs bold and keeps palette highlight colors', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E paste cleaner', async (add) => {
      await add('c1', 'chapter', null, 'Docs');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);

    const docs = fs.readFileSync(path.join(FIXTURES, 'google-docs-paste.html'), 'utf8');
    const cleaned = await clean(page, docs);
    expect(cleaned).not.toMatch(/<b\b/);
    expect(cleaned).toContain('<span style="font-weight: 700">Seventeen</span>');
    expect(cleaned).toContain('<span style="font-style: italic">stranger</span>');

    expect(await clean(page, '<mark data-color="#c9f0c9">green</mark>')).toBe(
      '<mark data-color="#c9f0c9">green</mark>',
    );
    expect(
      await clean(page, '<mark style="background-color: rgb(255, 209, 227)">pink</mark>'),
    ).toBe('<mark data-color="#ffd1e3">pink</mark>');
    expect(await clean(page, '<mark data-color="#123456">odd</mark>')).toBe('<mark>odd</mark>');
    expect(await clean(page, '<span style="background-color:#fff3a3">plain</span>')).toBe(
      '<span>plain</span>',
    );
    expect(await clean(page, '<strong style="font-weight: 400">thin</strong>')).toBe('thin');
    expect(await clean(page, '<b>still bold</b>')).toBe('<b>still bold</b>');
    expect(await clean(page, '<span style="font-weight: bold">heavy</span>')).toBe(
      '<span style="font-weight: 700">heavy</span>',
    );

    await editor.click();
    await paste(page, docs);
    await expect(editor).toContainText('The lighthouse keeper counted the gulls again.');
    await expect(editor.locator('strong')).toHaveCount(1);
    await expect(editor.locator('strong')).toHaveText('Seventeen');
    await expect(editor.locator('em')).toHaveText('stranger');

    await page.keyboard.press('Enter');
    await paste(
      page,
      '<p><mark data-color="#c9f0c9">green note</mark> and <span style="background-color:#ffd1e3">no mark</span></p>',
    );
    await expect(editor.locator('mark')).toHaveCount(1);
    await expect(editor.locator('mark')).toHaveText('green note');
    await expect(editor.locator('mark')).toHaveAttribute('data-color', '#c9f0c9');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
  });

  test('B3: the last opened section reopens from the library after a reload', async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const book = await seedBook(request, 'E2E last section', async (add) => {
      await add('a', 'chapter', null, 'First');
      await add('b', 'chapter', null, 'Second');
    });
    await openBook(page, book.id);
    await row(page, 'Chapter 2').click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${book.nodes.b!.id}$`));
    await expect(editorOf(page)).toBeVisible();

    await page.getByRole('link', { name: 'Library' }).click();
    await page.reload();
    await page.getByRole('link', { name: /E2E last section/ }).click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${book.nodes.b!.id}$`));
    await expect(page.getByRole('treeitem', { selected: true })).toContainText(
      'Chapter 2 — Second',
    );
    await expect(editorOf(page)).toBeVisible();

    await request.delete(`/api/nodes/${book.nodes.b!.id}`);
    await page.goto('/');
    await page.getByRole('link', { name: /E2E last section/ }).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/book/${book.id}/manuscript$`));
    await expect(editorOf(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('B4: deleting every Codex category leaves it empty until the defaults are asked for', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E codex empty', async () => {});
    const res = await request.get(`/api/books/${book.id}/codex`);
    const { categories } = (await res.json()) as { categories: { id: string }[] };
    expect(categories).toHaveLength(8);
    for (const c of categories) {
      expect((await request.delete(`/api/codex/categories/${c.id}`)).ok()).toBe(true);
    }

    await page.goto(`/book/${book.id}/codex`);
    const add = page.getByRole('button', { name: 'Add default categories' });
    await expect(add).toBeVisible();
    await page.reload();
    await expect(add).toBeVisible();
    expect(await categoryNames(request, book.id)).toEqual([]);

    await add.click();
    await expect(page.getByRole('button', { name: 'Category menu: Characters' })).toBeVisible();
    expect(await categoryNames(request, book.id)).toHaveLength(8);
  });

  test('B7: a Markdown export right after typing contains the last words', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E export flush', async (add) => {
      await add('c1', 'chapter', null, 'Fresh');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.click();
    await page.keyboard.type('The very last words typed.');
    await page.getByRole('button', { name: 'Book menu' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export Markdown' }).click(),
    ]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    expect(text).toContain('The very last words typed.');
  });

  test('B7: an export with unsaved text asks first', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E export unsaved', async (add) => {
      await add('c1', 'chapter', null, 'Blocked');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await failSaves(page);
    await editor.click();
    await page.keyboard.type('Unsaved words.');
    await page.getByRole('button', { name: 'Book menu' }).click();
    await page.getByRole('menuitem', { name: 'Export plain text' }).click();
    const ask = page.getByRole('dialog', { name: 'Unsaved text' });
    await expect(ask).toContainText('Some text is not saved and will not be in the export.');
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toHaveCount(0);

    await page.getByRole('button', { name: 'Book menu' }).click();
    await page.getByRole('menuitem', { name: 'Export plain text' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      ask.getByRole('button', { name: 'Export anyway' }).click(),
    ]);
    expect(fs.readFileSync(await download.path(), 'utf8')).not.toContain('Unsaved words.');
  });

  test('B8: duplicating a map right after an edit copies the edit', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E map duplicate', async () => {});
    await page.goto(`/book/${book.id}/maps`);
    await page.getByRole('button', { name: 'New map' }).click();
    await page.getByRole('radio', { name: /^Blank/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByTestId('map-node')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add node' }).click();
    await page.getByRole('button', { name: /Actions for Untitled map/ }).click();
    await page.getByRole('menuitem', { name: /Duplicate/ }).click();
    await expect(page.getByRole('link', { name: /Untitled map \(copy\)/ })).toBeVisible();

    const res = await request.get(`/api/books/${book.id}/maps`);
    const { maps } = (await res.json()) as {
      maps: { title: string; data: { nodes: unknown[] } }[];
    };
    expect(maps.map((m) => [m.title, m.data.nodes.length])).toEqual([
      ['Untitled map', 1],
      ['Untitled map (copy)', 1],
    ]);
  });
});

test.describe('M9 group C: test gaps', () => {
  test('C1: dragging Ch2 below Ch4 in the same parent renumbers and survives a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E drag down', async (add) => {
      await add('p1', 'part', null, 'Only');
      for (const n of [1, 2, 3, 4]) await add(`c${n}`, 'chapter', 'p1', `Ch${n}`);
    });
    await openBook(page, book.id);
    await expect(row(page, 'Chapter 4')).toBeVisible();

    // The visible row content is shorter than the row, so aim at the whole tree item.
    const target = page.getByRole('treeitem').filter({ hasText: 'Chapter 4' });
    await row(page, 'Chapter 2').dragTo(target, { targetPosition: BOTTOM_EDGE });

    const moved = [
      'Part 1 — Only',
      'Chapter 1 — Ch1',
      'Chapter 2 — Ch3',
      'Chapter 3 — Ch4',
      'Chapter 4 — Ch2',
    ];
    await expect.poll(() => visibleTitles(page)).toEqual(moved);
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['Only', 'Only > Ch1', 'Only > Ch3', 'Only > Ch4', 'Only > Ch2']);

    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    expect(await visibleTitles(page)).toEqual(moved);
  });
});

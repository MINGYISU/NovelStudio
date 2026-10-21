import { expect, test } from '@playwright/test';
import { editorOf, openSection, rows, savedText, seedBook, seedText } from './helpers.ts';

const TOGGLE_FOCUS = 'ControlOrMeta+Shift+F';
const OPEN_REPLACE = 'ControlOrMeta+Alt+F';

test.describe('focus mode (WS-03)', () => {
  test('Cmd/Ctrl+Shift+F hides the chrome, keeps typing and save status, and Escape returns', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E focus', async (add) => {
      await add('c1', 'chapter', null, 'Quiet');
    });
    await seedText(request, book.nodes.c1!.id, 'Hello');
    await openSection(page, book.id, book.nodes.c1!.id);

    const views = page.getByRole('navigation', { name: 'Views' });
    await expect(views).toBeVisible();
    await expect(page.getByLabel('Section details')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();

    await page.keyboard.press(TOGGLE_FOCUS);
    await expect(views).toHaveCount(0);
    await expect(page.getByLabel('Section details')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(editorOf(page)).toBeVisible();
    // A failed save must stay visible even without the top bar.
    await expect(page.getByTestId('save-status')).toHaveText('Saved');

    await editorOf(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' world');
    await expect.poll(() => savedText(request, book.nodes.c1!.id)).toBe('Hello world');

    await page.keyboard.press('Escape');
    await expect(views).toBeVisible();
    await expect(rows(page).first()).toBeVisible();

    await page.keyboard.press(TOGGLE_FOCUS);
    await expect(views).toHaveCount(0);
    await page.getByRole('button', { name: 'Exit focus mode' }).click();
    await expect(views).toBeVisible();
  });

  test('a reload always starts in the normal layout', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E focus reload', async (add) => {
      await add('c1', 'chapter', null, 'Quiet');
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    await page.keyboard.press(TOGGLE_FOCUS);
    await expect(page.getByRole('navigation', { name: 'Views' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
  });
});

test.describe('find and replace across the book (ED-09)', () => {
  test('renames a character everywhere, saves unsaved typing first, and snapshots can undo it', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E replace', async (add) => {
      await add('c1', 'chapter', null, 'One');
      await add('c2', 'chapter', null, 'Two');
      await add('c3', 'chapter', null, 'Three');
    });
    const [c1, c2, c3] = [book.nodes.c1!, book.nodes.c2!, book.nodes.c3!];
    await seedText(request, c1.id, 'Anna met Anna.');
    await seedText(request, c2.id, 'Nobody here.');
    await seedText(request, c3.id, 'Then anna left.');
    await openSection(page, book.id, c1.id);

    // Text typed a moment ago is not saved yet; the dialog must save it before searching.
    await editorOf(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Anna again.');

    await page.keyboard.press(OPEN_REPLACE);
    const dialog = page.getByRole('dialog', { name: 'Find and replace in book' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Find', { exact: true }).fill('anna');
    await dialog.getByLabel('Replace with').fill('Bea');
    await dialog.getByRole('button', { name: 'Find all' }).click();

    await expect(dialog.getByRole('status').first()).toHaveText('4 matches in 2 sections');
    await expect(
      dialog.getByRole('list', { name: 'Matches by section' }).locator('li'),
    ).toHaveCount(2);

    // Leave Chapter 3 out.
    await dialog.getByLabel('Replace in Chapter 3').uncheck();
    await dialog.getByRole('button', { name: 'Replace 3 in 1 section' }).click();
    await expect(dialog.getByText('Replaced 3 matches in 1 section.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // The open editor shows the new text, and the server agrees.
    await expect(editorOf(page)).toHaveText('Bea met Bea. Bea again.');
    expect(await savedText(request, c1.id)).toBe('Bea met Bea. Bea again.');
    expect(await savedText(request, c2.id)).toBe('Nobody here.');
    expect(await savedText(request, c3.id)).toBe('Then anna left.');

    // A snapshot of the old text exists; restoring it brings the old name back.
    const list = await request.get(`/api/nodes/${c1.id}/snapshots`);
    const { snapshots } = (await list.json()) as { snapshots: { id: string; reason: string }[] };
    const before = snapshots.find((s) => s.reason === 'before-replace');
    expect(before).toBeDefined();
    await page.getByRole('button', { name: 'Snapshots' }).click();
    const snapshotDialog = page.getByRole('dialog', { name: 'Snapshots' });
    await snapshotDialog.getByRole('button', { name: /Before replace/ }).click();
    await snapshotDialog.getByRole('button', { name: 'Restore this version' }).click();
    await expect(editorOf(page)).toHaveText('Anna met Anna. Anna again.');
  });

  test('says so when nothing matches and changes nothing', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E replace none', async (add) => {
      await add('c1', 'chapter', null, 'One');
    });
    await seedText(request, book.nodes.c1!.id, 'Plain words.');
    await openSection(page, book.id, book.nodes.c1!.id);
    await page.keyboard.press(OPEN_REPLACE);
    const dialog = page.getByRole('dialog', { name: 'Find and replace in book' });
    await dialog.getByLabel('Find', { exact: true }).fill('zebra');
    await dialog.getByLabel('Find', { exact: true }).press('Enter');
    await expect(dialog.getByText('No matches for “zebra”.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Replace \d/ })).toHaveCount(0);
  });
});

test.describe('display: sepia, spacing, background (DISP-02)', () => {
  test('sepia theme, paragraph spacing and a background color apply and persist', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E sepia', async (add) => {
      await add('c1', 'chapter', null, 'Look');
    });
    await request.put(`/api/nodes/${book.nodes.c1!.id}/content`, {
      data: {
        rev: 0,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
          ],
        },
      },
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    const panel = page.getByLabel('Editor', { exact: true });

    await page.getByRole('button', { name: 'Display settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Display settings' });
    await dialog.getByLabel('Theme').selectOption('sepia');
    await dialog.getByLabel('Space between paragraphs (em)').fill('1.5');
    await dialog.getByLabel('Use a custom background color').check();
    await dialog.getByLabel('Background color', { exact: true }).fill('#e8dfc8');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(panel).toHaveAttribute('data-theme', 'sepia');
    await expect(panel).toHaveCSS('background-color', 'rgb(232, 223, 200)');
    const first = editorOf(page).locator('p').first();
    await expect(first).toHaveCSS('margin-bottom', '27px');

    await page.reload();
    await expect(page.getByLabel('Editor', { exact: true })).toHaveAttribute('data-theme', 'sepia');
    await expect(editorOf(page).locator('p').first()).toHaveCSS('margin-bottom', '27px');
  });

  test('a background image can be added, shows behind the text, survives a reload and can be removed', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E backdrop', async (add) => {
      await add('c1', 'chapter', null, 'Look');
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    await expect(page.getByTestId('editor-backdrop')).toHaveCount(0);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.getByRole('button', { name: 'Display settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Display settings' });
    await dialog.getByLabel('Background image').setInputFiles({
      name: 'paper.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    const backdrop = page.getByTestId('editor-backdrop');
    await expect(backdrop).toHaveCount(1);
    await expect(backdrop).toHaveCSS('background-image', /\/assets\/.+/);
    await page.reload();
    await expect(page.getByTestId('editor-backdrop')).toHaveCount(1);

    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByRole('button', { name: 'Remove background image' }).click();
    await page
      .getByRole('dialog', { name: 'Display settings' })
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(page.getByTestId('editor-backdrop')).toHaveCount(0);
  });
});

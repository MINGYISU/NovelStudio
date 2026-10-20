import { expect, test } from '@playwright/test';
import { editorOf, openBook, openSection, row, savedText, seedBook, seedText } from './helpers.ts';

const PASTE_HTML = `
  <meta charset="utf-8"><style>p { color: red }</style>
  <h1 style="font-family: Papyrus; color: #ff0000" class="MsoTitle">Big title</h1>
  <h3>Small heading</h3>
  <p class="MsoNormal" style="font-size: 30px; color: blue; font-family: 'Comic Sans MS'">
    Plain <b>bold</b> <i>italic</i> <font face="Impact" color="red">fonty</font>
    <span style="font-weight: 700; background-color: yellow">span bold</span>
    <a href="https://example.com/x">linked</a> <img src="https://example.com/i.png">
  </p>
  <ul><li>list item</li></ul>
  <script>window.__pwned = true</script>`;

test.describe('editor and autosave', () => {
  test('typing then switching section immediately, then reloading keeps the text (PRD scenario 9)', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E autosave', async (add) => {
      await add('c1', 'chapter', null, 'First');
      await add('c2', 'chapter', null, 'Second');
    });
    const first = book.nodes.c1!;
    const second = book.nodes.c2!;
    await openSection(page, book.id, first.id);

    await editorOf(page).click();
    await page.keyboard.type('She did not look up.');
    // No pause: the section changes well within the one-second autosave delay.
    await row(page, 'Chapter 2').click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${second.id}$`));
    await expect(editorOf(page)).toHaveText('');

    await expect.poll(() => savedText(request, first.id)).toBe('She did not look up.');

    await page.goto(`/book/${book.id}/manuscript/${first.id}`);
    await expect(editorOf(page)).toHaveText('She did not look up.');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
  });

  test('switching back to a section whose save is still in flight shows the newest text', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E quick return', async (add) => {
      await add('c1', 'chapter', null, 'First');
      await add('c2', 'chapter', null, 'Second');
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    await editorOf(page).click();
    await page.keyboard.type('Quickly typed');
    await row(page, 'Chapter 2').click();
    await row(page, 'Chapter 1').click();
    await expect(editorOf(page)).toHaveText('Quickly typed');
  });

  test('a second tab saving first makes the stale tab show "Changed elsewhere" and keeps the newer text', async ({
    page,
    context,
    request,
  }) => {
    const book = await seedBook(request, 'E2E two tabs', async (add) => {
      await add('c1', 'chapter', null, 'Shared');
    });
    const id = book.nodes.c1!.id;
    await seedText(request, id, 'Start.');

    await openSection(page, book.id, id);
    const other = await context.newPage();
    await openSection(other, book.id, id);

    await editorOf(other).click();
    await other.keyboard.press('ArrowRight');
    await other.keyboard.type(' From the other tab.');
    await expect(other.getByTestId('save-status')).toHaveText('Saved');
    await expect.poll(() => savedText(request, id)).toBe('Start. From the other tab.');

    await editorOf(page).click();
    await page.keyboard.type('Stale edit');
    await expect(page.getByText('Changed elsewhere — reload')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'changed elsewhere' })).toBeVisible();
    expect(await savedText(request, id)).toBe('Start. From the other tab.');

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(editorOf(page)).toHaveText('Start. From the other tab.');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
  });

  test('the formatting toolbar stores only allowed formatting and it survives a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E formatting', async (add) => {
      await add('c1', 'chapter', null, 'Format');
    });
    const id = book.nodes.c1!.id;
    await openSection(page, book.id, id);
    const editor = editorOf(page);
    await editor.click();
    await page.keyboard.type('Bold words');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.getByRole('button', { name: 'Underline' }).click();
    await page.getByRole('button', { name: 'Align center' }).click();
    await page.getByRole('button', { name: 'Highlight' }).click();
    await page.getByRole('menuitem', { name: 'Green' }).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Scene break' }).click();
    await page.keyboard.type('After the break');

    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    for (const tag of ['strong', 'u', 'mark']) {
      await expect(editor.locator(tag)).toHaveText('Bold words');
    }
    await expect(editor.locator('hr')).toHaveCount(1);

    const res = await request.get(`/api/nodes/${id}`);
    const { node } = (await res.json()) as { node: { content: unknown } };
    const json = JSON.stringify(node.content);
    expect(json).toContain('"bold"');
    expect(json).toContain('"underline"');
    expect(json).toContain('"horizontalRule"');
    expect(json).toContain('"#c9f0c9"');
    expect(json).toContain('"center"');

    await page.reload();
    await expect(editor.locator('hr')).toHaveCount(1);
    await expect(editor.locator('p').first()).toHaveCSS('text-align', 'center');
  });

  test('pasted HTML keeps only supported formatting and runs no script', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E paste', async (add) => {
      await add('c1', 'chapter', null, 'Paste');
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    const editor = editorOf(page);
    await editor.click();
    await editor.evaluate((el, html) => {
      const data = new DataTransfer();
      data.setData('text/html', html);
      data.setData('text/plain', 'plain fallback');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, PASTE_HTML);

    await expect(editor).toContainText('Big title');
    await expect(editor).toContainText('Small heading');
    await expect(editor).toContainText('list item');
    await expect(editor.locator('h1')).toHaveText('Big title');
    await expect(editor.locator('strong').first()).toHaveText('bold');
    await expect(editor.locator('em')).toHaveText('italic');
    await expect(editor.locator('a, img, ul, h3, script, font')).toHaveCount(0);
    expect(await editor.locator('[style*="font"], [style*="color"], [class*="Mso"]').count()).toBe(
      0,
    );
    expect(await editor.locator('mark').count()).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned),
    ).toBeUndefined();

    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    const res = await request.get(`/api/nodes/${book.nodes.c1!.id}`);
    expect(res.ok()).toBe(true);
  });

  test('find in section (Cmd+F) highlights and steps through matches', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E find', async (add) => {
      await add('c1', 'chapter', null, 'Find');
    });
    const id = book.nodes.c1!.id;
    await seedText(request, id, 'The lantern, the Lantern and a lantern.');
    await openSection(page, book.id, id);

    await page.keyboard.press('ControlOrMeta+f');
    const find = page.getByRole('textbox', { name: 'Find in this section' });
    await expect(find).toBeFocused();
    await find.fill('lantern');
    await expect(page.getByText('1 of 3')).toBeVisible();
    await expect(editorOf(page).locator('.find-match')).toHaveCount(3);
    await find.press('Enter');
    await expect(page.getByText('2 of 3')).toBeVisible();
    await expect(editorOf(page).locator('.find-current')).toHaveText('Lantern');
    await find.press('Shift+Enter');
    await expect(page.getByText('1 of 3')).toBeVisible();

    await page.getByRole('button', { name: 'Match case' }).click();
    await expect(page.getByText('1 of 2')).toBeVisible();
    await find.fill('nothing here');
    await expect(page.getByText('No matches')).toBeVisible();

    await find.press('Escape');
    await expect(find).toHaveCount(0);
    await expect(editorOf(page).locator('.find-match')).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    expect(await savedText(request, id)).toBe('The lantern, the Lantern and a lantern.');
  });

  test('word counts for section, book and selection (CJK counted per character)', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E counts', async (add) => {
      await add('c1', 'chapter', null, 'Counts');
      await add('c2', 'chapter', null, 'Other');
    });
    await seedText(request, book.nodes.c2!.id, 'one two three');
    await openSection(page, book.id, book.nodes.c1!.id);
    await editorOf(page).click();
    await page.keyboard.type('Rain fell 她没有抬头');
    const counts = page.getByLabel('Word counts');
    await expect(counts).toContainText('Section 7 words');
    await expect(counts).toContainText('Book 10 words');
    await page.keyboard.press('ControlOrMeta+a');
    await expect(counts).toContainText('Selection 7 words');
    await expect(page.getByText('Saved')).toBeVisible();
    await expect(page.getByLabel('Manuscript').getByText('10 words')).toBeVisible();
  });

  test('snapshots can be browsed and a restore brings back the earlier text', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E snapshots', async (add) => {
      await add('c1', 'chapter', null, 'Snap');
    });
    const id = book.nodes.c1!.id;
    await seedText(request, id, 'The good old paragraph.');
    await openSection(page, book.id, id);

    await editorOf(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Something else entirely.');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await expect.poll(() => savedText(request, id)).toBe('Something else entirely.');

    await page.getByRole('button', { name: 'Snapshots' }).click();
    const dialog = page.getByRole('dialog', { name: 'Snapshots' });
    await expect(dialog.getByText('First edit')).toBeVisible();
    await dialog.getByRole('button', { name: /First edit/ }).click();
    await expect(dialog.getByLabel('Snapshot text')).toHaveText('The good old paragraph.');
    await dialog.getByRole('button', { name: 'Restore this version' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editorOf(page)).toHaveText('The good old paragraph.');
    await expect.poll(() => savedText(request, id)).toBe('The good old paragraph.');

    await page.getByRole('button', { name: 'Snapshots' }).click();
    await expect(page.getByRole('dialog').getByText('Before a restore')).toBeVisible();
  });

  test('display settings change how text looks, per book, and persist', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E display', async (add) => {
      await add('c1', 'chapter', null, 'Look');
    });
    await seedText(request, book.nodes.c1!.id, 'Some words');
    await openSection(page, book.id, book.nodes.c1!.id);
    const panel = page.getByLabel('Editor', { exact: true });
    await expect(panel).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Display settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Display settings' });
    await dialog.getByLabel('Font size (px)').fill('26');
    await dialog.getByLabel('First-line indent (em, 2 suits Chinese)').fill('2');
    await dialog.getByLabel('Theme').selectOption('dark');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(panel).toHaveAttribute('data-theme', 'dark');
    await expect(editorOf(page).locator('p').first()).toHaveCSS('text-indent', '52px');
    await expect(editorOf(page).locator('p').first()).toHaveCSS('font-size', '26px');

    await page.reload();
    await expect(page.getByLabel('Editor', { exact: true })).toHaveAttribute('data-theme', 'dark');
    expect(await savedText(request, book.nodes.c1!.id)).toBe('Some words');
  });

  test("switching sections with the editor open keeps each section's own text", async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E coexist', async (add) => {
      await add('c1', 'chapter', null, 'A');
      await add('c2', 'chapter', null, 'B');
    });
    await seedText(request, book.nodes.c1!.id, 'alpha text');
    await openBook(page, book.id);
    await row(page, 'Chapter 1').click();
    await expect(editorOf(page)).toHaveText('alpha text');
    await row(page, 'Chapter 2').click();
    await expect(editorOf(page)).toHaveText('');
    await row(page, 'Chapter 1').click();
    await expect(editorOf(page)).toHaveText('alpha text');
  });
});

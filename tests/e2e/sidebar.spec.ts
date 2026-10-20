import { expect, test } from '@playwright/test';
import { openBook, row, rows, seedBook, serverOrder, visibleTitles } from './helpers.ts';

const TOP_EDGE = { x: 60, y: 2 };

test.describe('sidebar drag and drop', () => {
  test('dragging Ch4 above Ch3 swaps the labels and survives a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E reorder', async (add) => {
      for (const n of [1, 2, 3, 4]) await add(`c${n}`, 'chapter', null, `Ch${n}`);
    });
    await openBook(page, book.id);
    expect(await visibleTitles(page)).toEqual([
      'Chapter 1 — Ch1',
      'Chapter 2 — Ch2',
      'Chapter 3 — Ch3',
      'Chapter 4 — Ch4',
    ]);

    await row(page, 'Chapter 4').dragTo(row(page, 'Chapter 3'), { targetPosition: TOP_EDGE });

    const swapped = ['Chapter 1 — Ch1', 'Chapter 2 — Ch2', 'Chapter 3 — Ch4', 'Chapter 4 — Ch3'];
    await expect.poll(() => visibleTitles(page)).toEqual(swapped);
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Ch1', 'Ch2', 'Ch4', 'Ch3']);

    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    expect(await visibleTitles(page)).toEqual(swapped);
  });

  test('dragging a Part into its own Chapter is refused and changes nothing', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E refused', async (add) => {
      await add('p1', 'part', null, 'Alpha');
      await add('c1', 'chapter', 'p1', 'Child');
      await add('p2', 'part', null, 'Beta');
    });
    await openBook(page, book.id);
    const before = await visibleTitles(page);
    expect(before).toEqual(['Part 1 — Alpha', 'Chapter 1 — Child', 'Part 2 — Beta']);
    const serverBefore = await serverOrder(request, book.id);

    const moves: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/move')) moves.push(req.url());
    });

    await row(page, 'Part 1').dragTo(row(page, 'Chapter 1'));

    await page.waitForTimeout(500);
    expect(await visibleTitles(page)).toEqual(before);
    expect(await serverOrder(request, book.id)).toEqual(serverBefore);
    expect(moves).toEqual([]);
  });

  test('a rejected move is reverted and an error is shown', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E rollback', async (add) => {
      for (const n of [1, 2, 3]) await add(`c${n}`, 'chapter', null, `Ch${n}`);
    });
    await openBook(page, book.id);
    await page.route('**/api/nodes/*/move', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'BOOM', message: 'Disk full.' } }),
      }),
    );

    await row(page, 'Chapter 3').dragTo(row(page, 'Chapter 1'), { targetPosition: TOP_EDGE });

    await expect(page.getByRole('alert')).toContainText('reverted');
    await expect
      .poll(() => visibleTitles(page))
      .toEqual(['Chapter 1 — Ch1', 'Chapter 2 — Ch2', 'Chapter 3 — Ch3']);
    expect(await serverOrder(request, book.id)).toEqual(['Ch1', 'Ch2', 'Ch3']);
  });

  test('dragging a chapter into another part moves it between parents', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E between parents', async (add) => {
      await add('p1', 'part', null, 'One');
      await add('c1', 'chapter', 'p1', 'Alpha');
      await add('p2', 'part', null, 'Two');
      await add('c2', 'chapter', 'p2', 'Beta');
    });
    await openBook(page, book.id);

    await row(page, 'Chapter 1').dragTo(row(page, 'Part 2'));

    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'Two', 'Two > Alpha', 'Two > Beta']);
  });
});

test.describe('sidebar keyboard and editing', () => {
  test('Alt+Arrow, Tab and Shift+Tab move sections; Cmd/Ctrl+Z undoes the last move', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E keyboard', async (add) => {
      await add('p1', 'part', null, 'One');
      await add('c1', 'chapter', 'p1', 'Alpha');
      await add('c2', 'chapter', 'p1', 'Beta');
      await add('c3', 'chapter', null, 'Loose');
    });
    await openBook(page, book.id);

    await row(page, 'Chapter 2').click();
    await page.keyboard.press('Alt+ArrowUp');
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'One > Beta', 'One > Alpha', 'Loose']);

    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'One > Alpha', 'One > Beta', 'Loose']);

    await row(page, 'Chapter 3').click();
    await page.keyboard.press('Tab');
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'One > Alpha', 'One > Beta', 'One > Loose']);

    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'One > Alpha', 'One > Beta', 'Loose']);

    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['One', 'One > Alpha', 'One > Beta', 'One > Loose']);
  });

  test('double-click renames inline and the new title survives a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E rename', async (add) => {
      await add('c1', 'chapter', null, 'Old');
    });
    await openBook(page, book.id);

    await row(page, 'Chapter 1').dblclick();
    const input = page.getByRole('textbox', { name: 'Section title' });
    await input.fill('New');
    await input.press('Enter');

    await expect.poll(() => visibleTitles(page)).toEqual(['Chapter 1 — New']);
    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    expect(await visibleTitles(page)).toEqual(['Chapter 1 — New']);
  });

  test('context menu duplicates a section with its subtree', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E duplicate', async (add) => {
      await add('c1', 'chapter', null, 'Source');
      await add('s1', 'scene', 'c1', 'Inner');
    });
    await openBook(page, book.id);

    await row(page, 'Chapter 1').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();

    await expect
      .poll(() => serverOrder(request, book.id))
      .toEqual(['Source', 'Source > Inner', 'Source (copy)', 'Source (copy) > Inner']);
  });

  test('context menu trashes a section and the notice can restore it', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E trash', async (add) => {
      await add('c1', 'chapter', null, 'Keep');
      await add('c2', 'chapter', null, 'Drop');
    });
    await openBook(page, book.id);

    await row(page, 'Chapter 2').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Keep']);

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect.poll(() => serverOrder(request, book.id)).toEqual(['Keep', 'Drop']);
  });

  test('fold state is remembered per book', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E folds', async (add) => {
      await add('p1', 'part', null, 'One');
      await add('c1', 'chapter', 'p1', 'Inside');
    });
    await openBook(page, book.id);
    await expect(row(page, 'Chapter 1')).toBeVisible();

    await row(page, 'Part 1').getByRole('button', { name: 'Collapse' }).click();
    await expect(row(page, 'Chapter 1')).toHaveCount(0);

    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    await expect(row(page, 'Chapter 1')).toHaveCount(0);
  });
});

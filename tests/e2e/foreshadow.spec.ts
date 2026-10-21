import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBook, row, rows, seedBook, visibleTitles, type SeededBook } from './helpers.ts';

const TOP_EDGE = { x: 60, y: 2 };

async function seedChapters(request: APIRequestContext, title: string, count: number) {
  return seedBook(request, title, async (add) => {
    for (let n = 1; n <= count; n += 1) await add(`c${n}`, 'chapter', null, `Ch${n}`);
  });
}

/** A thread with a setup and a payoff, created through the API. */
async function seedThread(
  request: APIRequestContext,
  book: SeededBook,
  title: string,
  occurrences: [role: 'setup' | 'hint' | 'payoff', key: string][],
): Promise<string> {
  const created = await request.post(`/api/books/${book.id}/foreshadows`, {
    data: { title, status: 'planted' },
  });
  expect(created.ok()).toBe(true);
  const { thread } = (await created.json()) as { thread: { id: string } };
  for (const [role, key] of occurrences) {
    const res = await request.post(`/api/foreshadows/${thread.id}/occurrences`, {
      data: { nodeId: book.nodes[key]!.id, role },
    });
    expect(res.ok()).toBe(true);
  }
  return thread.id;
}

const badges = (page: Page) => page.getByTestId('foreshadow-badge');

test.describe('foreshadowing', () => {
  test('dragging the payoff chapter above the setup shows PAYOFF_BEFORE_SETUP; moving it back clears it', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow move', 8);
    await seedThread(request, book, 'The broken compass', [
      ['setup', 'c2'],
      ['payoff', 'c8'],
    ]);
    await openBook(page, book.id);
    await expect(badges(page)).toHaveCount(0);

    await row(page, 'Chapter 8').dragTo(row(page, 'Chapter 2'), { targetPosition: TOP_EDGE });
    await expect.poll(() => visibleTitles(page)).toContain('Chapter 2 — Ch8');

    // The badge and the toast appear at once, without leaving the manuscript view.
    await expect(badges(page)).toHaveCount(2);
    await expect(badges(page).first()).toHaveAttribute('data-kinds', 'PAYOFF_BEFORE_SETUP');
    await expect(row(page, 'Chapter 2 — Ch8').getByTestId('foreshadow-badge')).toBeVisible();
    await expect(row(page, 'Chapter 3 — Ch2').getByTestId('foreshadow-badge')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Review' })).toContainText(
      '“The broken compass”: a payoff comes before its first setup.',
    );

    await page.getByRole('link', { name: 'Foreshadowing' }).click();
    await expect(page.getByTestId('thread-warning')).toHaveAttribute(
      'data-kind',
      'PAYOFF_BEFORE_SETUP',
    );
    await expect(page.getByTestId('warning-summary')).toHaveText('1 warning');

    await page.getByRole('link', { name: 'Manuscript' }).click();
    await expect(rows(page).first()).toBeVisible();
    // Back behind the setup (just above the last chapter): the warning goes away.
    await row(page, 'Chapter 2 — Ch8').dragTo(row(page, 'Chapter 8'), { targetPosition: TOP_EDGE });
    await expect.poll(() => visibleTitles(page)).toContain('Chapter 7 — Ch8');
    await expect(badges(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Foreshadowing' }).click();
    await expect(page.getByTestId('thread-warning')).toHaveCount(0);
    await expect(page.getByTestId('warning-summary')).toHaveText('No warnings');
  });

  test('threads and occurrences are created in the UI and listed in reading order, with a matrix', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow ui', 3);
    await page.goto(`/book/${book.id}/foreshadow`);
    await expect(page.getByText('No threads yet.')).toBeVisible();

    await page.getByRole('button', { name: 'New thread' }).click();
    await page.getByLabel('Title').fill('The red door');
    await page.getByLabel('Status').selectOption('planted');
    await page.getByLabel('Description').fill('Locked until the end.');
    await page.getByRole('button', { name: 'Create thread' }).click();
    const thread = page.getByTestId('thread');
    await expect(thread).toContainText('The red door');
    await expect(thread).toContainText('Planted');

    // Added payoff first, then the setup: the list still shows reading order.
    await thread.getByRole('button', { name: 'Occurrence', exact: true }).click();
    await page.getByLabel('Section').selectOption({ label: 'Chapter 3 — Ch3' });
    await page.getByLabel('Role').selectOption('payoff');
    await page.getByLabel('Note (optional)').fill('The door opens.');
    await page.getByRole('button', { name: 'Add occurrence' }).click();
    await thread.getByRole('button', { name: 'Occurrence', exact: true }).click();
    await page.getByLabel('Section').selectOption({ label: 'Chapter 1 — Ch1' });
    await page.getByLabel('Role').selectOption('setup');
    await page.getByLabel('Excerpt (quoted text, optional)').fill('A red door stood shut.');
    await page.getByRole('button', { name: 'Add occurrence' }).click();

    const items = thread.locator('li[data-role]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Setup · Chapter 1 — Ch1');
    await expect(items.nth(0)).toContainText('A red door stood shut.');
    await expect(items.nth(1)).toContainText('Payoff · Chapter 3 — Ch3');
    await expect(items.nth(1)).toContainText('The door opens.');
    await expect(page.getByTestId('thread-warning')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Matrix' }).click();
    const cells = page.getByTestId('matrix-cell');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toHaveText('●');
    await expect(cells.nth(1)).toHaveText('★');
    await cells.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/book/${book.id}/manuscript/${book.nodes.c3!.id}$`));
  });

  test('an occurrence can be edited, moved to another section and removed, and a thread deleted', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow edit', 3);
    await seedThread(request, book, 'The compass', [['setup', 'c1']]);
    await page.goto(`/book/${book.id}/foreshadow`);

    await page.getByRole('button', { name: 'Edit Setup occurrence' }).click();
    await page.getByLabel('Section').selectOption({ label: 'Chapter 2 — Ch2' });
    await page.getByLabel('Role').selectOption('hint');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('li[data-role="hint"]')).toContainText('Hint · Chapter 2 — Ch2');

    await page.getByRole('button', { name: 'Remove Hint occurrence' }).click();
    await expect(page.getByText('No occurrences yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Delete thread The compass' }).click();
    await page.getByRole('button', { name: 'Delete thread', exact: true }).click();
    await expect(page.getByText('No threads yet.')).toBeVisible();
  });

  test('the right panel lists the threads that occur in the selected section', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow panel', 3);
    await seedThread(request, book, 'The compass', [
      ['setup', 'c1'],
      ['payoff', 'c3'],
    ]);
    await seedThread(request, book, 'The red door', [['hint', 'c1']]);

    await page.goto(`/book/${book.id}/manuscript/${book.nodes.c1!.id}`);
    const entries = page.getByTestId('section-thread');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText('The compass');
    await expect(entries.nth(1)).toContainText('The red door');

    await row(page, 'Chapter 2').click();
    await expect(page.getByText('No threads occur here.')).toBeVisible();

    await row(page, 'Chapter 3').click();
    await expect(entries).toHaveCount(1);
    await entries.first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/book/${book.id}/foreshadow$`));
  });

  test('trashing a section with an occurrence raises ORPHANED, and restoring it clears the warning', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow trash', 3);
    await seedThread(request, book, 'The compass', [
      ['setup', 'c1'],
      ['payoff', 'c3'],
    ]);
    await page.goto(`/book/${book.id}/foreshadow`);
    await expect(page.getByTestId('warning-summary')).toHaveText('No warnings');

    const trashed = await request.delete(`/api/nodes/${book.nodes.c3!.id}`);
    expect(trashed.ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId('thread-warning').first()).toBeVisible();
    await expect(page.getByTestId('thread')).toContainText('(in trash)');
    await expect(page.locator('[data-kind="ORPHANED"]')).toHaveCount(1);

    const restored = await request.post(`/api/nodes/${book.nodes.c3!.id}/restore`);
    expect(restored.ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId('thread-warning')).toHaveCount(0);
  });

  test('trashing a section from the sidebar keeps the Restore button next to the new warning', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow trash notice', 3);
    await seedThread(request, book, 'The compass', [
      ['setup', 'c1'],
      ['payoff', 'c3'],
    ]);
    await openBook(page, book.id);
    await row(page, 'Chapter 3').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();

    const notice = page.getByRole('status').filter({ hasText: 'trash' });
    await expect(notice).toContainText('trashed or missing');
    await notice.getByRole('button', { name: 'Restore' }).click();
    await expect(row(page, 'Chapter 3')).toBeVisible();
  });

  test('the dormant threshold is configurable, applies at once and survives a reload', async ({
    page,
    request,
  }) => {
    const book = await seedChapters(request, 'E2E foreshadow dormant', 6);
    await seedThread(request, book, 'The compass', [
      ['setup', 'c1'],
      ['payoff', 'c6'],
    ]);
    await page.goto(`/book/${book.id}/foreshadow`);
    const input = page.getByLabel('Dormant after (chapters)');
    await expect(input).toHaveValue('10');
    await expect(page.getByTestId('thread-warning')).toHaveCount(0);

    await input.fill('3');
    await input.press('Enter');
    await expect(page.locator('[data-kind="DORMANT"]')).toHaveCount(1);

    await page.reload();
    await expect(page.getByLabel('Dormant after (chapters)')).toHaveValue('3');
    await expect(page.locator('[data-kind="DORMANT"]')).toHaveCount(1);

    // An invalid value is put back instead of being saved.
    await page.getByLabel('Dormant after (chapters)').fill('0');
    await page.getByLabel('Dormant after (chapters)').press('Enter');
    await expect(page.getByLabel('Dormant after (chapters)')).toHaveValue('3');
  });
});

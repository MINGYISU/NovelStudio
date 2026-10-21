import { expect, test, type Page } from '@playwright/test';
import { openBook, row, rows, seedBook, visibleTitles } from './helpers.ts';

/** A new section normally opens its title for renaming; keep the default title. */
async function acceptTitle(page: Page): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Section title' });
  await input.waitFor({ timeout: 2000 }).then(
    () => input.press('Enter'),
    () => undefined,
  );
}

/**
 * PRD §13 scenarios that had no browser test before M8 (1, 2, 7, 8, 15 is in import-export.spec.ts),
 * plus the hot backup list (HOT-02). The remaining scenarios are covered by sidebar, editor, maps,
 * foreshadow, codex and cold-backup specs; see docs/ROADMAP.md (M8).
 */
test.describe('acceptance scenarios', () => {
  test('1. two books are created and both are still in the library after a reload', async ({
    page,
  }) => {
    const stamp = Date.now();
    const titles = [`Acceptance A ${stamp}`, `Acceptance B ${stamp}`];
    await page.goto('/');
    for (const title of titles) {
      await page.getByRole('button', { name: 'New' }).click();
      await page.getByRole('menuitem', { name: 'Create blank…' }).click();
      await page.getByRole('dialog', { name: 'New book' }).getByLabel('Title').fill(title);
      await page
        .getByRole('dialog', { name: 'New book' })
        .getByRole('button', { name: 'Create' })
        .click();
      // Creating a book opens it (or returns to the library); either way go back to the grid.
      await page.goto('/');
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await page.reload();
    for (const title of titles) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('2. volumes, parts, chapters and scenes can be created and collapsed', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'Acceptance tree', async () => {});
    await page.goto(`/book/${book.id}/manuscript`);
    await expect(page.getByText('No sections yet')).toBeVisible();

    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByRole('menuitem', { name: 'New volume' }).click();
    await acceptTitle(page);
    await expect.poll(() => visibleTitles(page)).toEqual(['Volume I']);

    for (const [parent, child, expected] of [
      ['Volume I', 'part', ['Volume I', 'Part 1']],
      ['Part 1', 'chapter', ['Volume I', 'Part 1', 'Chapter 1']],
      ['Chapter 1', 'scene', ['Volume I', 'Part 1', 'Chapter 1', '(untitled)']],
    ] as const) {
      await row(page, parent).click({ button: 'right' });
      await page.getByRole('menuitem', { name: `New ${child} inside` }).click();
      await acceptTitle(page);
      await expect.poll(() => visibleTitles(page)).toEqual(expected);
    }

    await row(page, 'Volume I').getByRole('button', { name: 'Collapse' }).click();
    await expect.poll(() => visibleTitles(page)).toEqual(['Volume I']);
    await row(page, 'Volume I').getByRole('button', { name: 'Expand' }).click();
    await expect.poll(() => visibleTitles(page)).toHaveLength(4);
  });

  test('7. marking a chapter unnumbered renumbers the ones after it', async ({ page, request }) => {
    const book = await seedBook(request, 'Acceptance unnumber', async (add) => {
      await add('c1', 'chapter', null, 'Prologue');
      await add('c2', 'chapter', null, 'Reunion');
      await add('c3', 'chapter', null, 'Rain');
    });
    await openBook(page, book.id);
    expect(await visibleTitles(page)).toEqual([
      'Chapter 1 — Prologue',
      'Chapter 2 — Reunion',
      'Chapter 3 — Rain',
    ]);

    await row(page, 'Prologue').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Unnumber' }).click();
    await expect
      .poll(() => visibleTitles(page))
      .toEqual(['Prologue', 'Chapter 1 — Reunion', 'Chapter 2 — Rain']);
  });

  test('8. the Chinese preset shows titles as 第三章 …', async ({ page, request }) => {
    const book = await seedBook(request, 'Acceptance 中文', async (add) => {
      await add('c1', 'chapter', null, '相遇');
      await add('c2', 'chapter', null, '雨夜');
      await add('c3', 'chapter', null, '重逢');
    });
    await openBook(page, book.id);
    await page.getByRole('button', { name: 'Structure' }).click();
    const dialog = page.getByRole('dialog', { name: 'Structure settings' });
    await dialog.getByRole('button', { name: 'Chinese (中文)' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => visibleTitles(page))
      .toEqual(['第一章 相遇', '第二章 雨夜', '第三章 重逢']);
    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    expect(await visibleTitles(page)).toEqual(['第一章 相遇', '第二章 雨夜', '第三章 重逢']);
  });
});

test.describe('settings: automatic database backups (HOT-02)', () => {
  test('lists backups and stages a restore that can be cancelled', async ({ page }) => {
    await page.goto('/settings');
    const list = page.getByRole('list', { name: 'Automatic database backups' });
    await expect(list.locator('li').first()).toBeVisible();

    await list
      .locator('li')
      .first()
      .getByRole('button', { name: /^Restore / })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Restore this backup?' });
    await dialog.getByRole('button', { name: 'Restore at next start' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/is waiting for a restart/)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel restore' }).click();
    await expect(page.getByText(/is waiting for a restart/)).toHaveCount(0);
  });

  test('the automatic daily cold backup can be switched on and its setting persists', async ({
    page,
  }) => {
    await page.goto('/settings');
    const box = page.getByLabel(/Back up automatically once a day/);
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Back up automatically once a day/)).toBeChecked();

    await page.getByLabel(/Back up automatically once a day/).uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
  });
});

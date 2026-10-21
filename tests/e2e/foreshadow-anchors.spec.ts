import { expect, test, type APIRequestContext } from '@playwright/test';
import { editorOf, openSection, row, seedBook, seedText } from './helpers.ts';

interface ApiThread {
  occurrences: { nodeId: string | null; anchored: boolean; anchorState: string | null }[];
}

async function occurrenceOf(request: APIRequestContext, bookId: string) {
  const res = await request.get(`/api/books/${bookId}/foreshadows`);
  expect(res.ok()).toBe(true);
  const { threads } = (await res.json()) as { threads: ApiThread[] };
  return threads[0]?.occurrences[0];
}

test.describe('in-text foreshadow anchors (FS-08)', () => {
  test('mark a sentence, highlight it, cut it into another chapter, then delete it', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E anchors', async (add) => {
      await add('a', 'chapter', null, 'Alpha');
      await add('b', 'chapter', null, 'Beta');
    });
    const alpha = book.nodes.a!;
    const beta = book.nodes.b!;
    await seedText(request, alpha.id, 'The needle shook.');
    await openSection(page, book.id, alpha.id);

    // Select the sentence and mark it as a setup of a new thread.
    await editorOf(page).getByText('The needle shook.').click({ clickCount: 3 });
    await page.getByRole('button', { name: 'Mark as foreshadowing' }).click();
    await page.getByRole('menuitem', { name: /Mark as setup/ }).click();
    await page.getByLabel('New thread title').fill('The broken compass');
    await page.getByRole('button', { name: 'Mark text' }).click();

    const anchor = editorOf(page).locator('[data-foreshadow-anchor]');
    await expect(anchor).toHaveText('The needle shook.');
    await expect
      .poll(() => occurrenceOf(request, book.id))
      .toMatchObject({ nodeId: alpha.id, anchored: true, anchorState: 'present' });

    // Highlighting follows the toggle.
    const highlighted = editorOf(page).locator('.foreshadow-anchor-text');
    const underline = () => highlighted.evaluate((el) => getComputedStyle(el).borderBottomWidth);
    await expect.poll(underline).toBe('2px');
    await page.getByRole('button', { name: 'Hide foreshadow anchors' }).click();
    await expect.poll(underline).toBe('0px');
    await page.getByRole('button', { name: 'Show foreshadow anchors' }).click();
    await expect.poll(underline).toBe('2px');

    // Cut it here, paste it into Beta: the occurrence now points to Beta.
    await editorOf(page).getByText('The needle shook.').click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+x');
    await row(page, 'Beta').click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${beta.id}$`));
    await editorOf(page).click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(editorOf(page).locator('[data-foreshadow-anchor]')).toHaveText(
      'The needle shook.',
    );
    await expect
      .poll(() => occurrenceOf(request, book.id))
      .toMatchObject({ nodeId: beta.id, anchored: true, anchorState: 'present' });
    await expect(page.getByTestId('section-thread')).toHaveCount(1);
    await expect(page.getByTestId('anchor-missing')).toHaveCount(0);

    // Delete the anchored text: the occurrence stays and says its anchor is missing.
    await editorOf(page).getByText('The needle shook.').click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await expect
      .poll(() => occurrenceOf(request, book.id))
      .toMatchObject({ nodeId: beta.id, anchored: true, anchorState: 'missing' });
    await expect(page.getByTestId('anchor-missing')).toBeVisible();

    await page.goto(`/book/${book.id}/foreshadow`);
    await expect(page.getByTestId('anchor-missing')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The broken compass' })).toBeVisible();
  });
});

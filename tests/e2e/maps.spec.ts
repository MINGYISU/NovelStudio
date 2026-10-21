import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { editorOf, row, seedBook } from './helpers.ts';

interface ApiMap {
  id: string;
  title: string;
  template: string;
  data: {
    nodes: { id: string; position: { x: number; y: number }; data: { title: string } }[];
    edges: unknown[];
    viewport: { x: number; y: number; zoom: number };
    layoutDirection: 'TB' | 'LR';
  };
}

async function storedMaps(request: APIRequestContext, bookId: string): Promise<ApiMap[]> {
  const res = await request.get(`/api/books/${bookId}/maps`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { maps: ApiMap[] }).maps;
}

async function createMapInUi(page: Page, template: string): Promise<void> {
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('radio', { name: new RegExp(`^${template}`) }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByTestId('map-canvas')).toBeVisible();
}

const saved = (page: Page) => expect(page.getByTestId('map-save-status')).toHaveText('Saved');

test.describe('story maps', () => {
  test('a link opens its section; renaming or moving the section updates the link; positions persist', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E maps', async (add) => {
      await add('c1', 'chapter', null, 'Alpha');
      await add('c2', 'chapter', null, 'Beta');
    });
    await page.goto(`/book/${book.id}/maps`);
    await createMapInUi(page, 'Plot tree');
    await expect(page.getByTestId('map-node')).toHaveCount(8);

    // Link the first node to Chapter 2.
    await page.getByTestId('map-node').first().click();
    await page.getByRole('button', { name: 'Add link…' }).click();
    await page.getByRole('button', { name: 'Chapter 2 — Beta' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    const chip = page.getByTestId('map-canvas').getByRole('button', { name: 'Chapter 2 — Beta' });
    await expect(chip).toBeVisible();
    await saved(page);

    // Clicking the link opens the section in the Manuscript view.
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/manuscript/${book.nodes['c2']!.id}$`));
    await expect(editorOf(page)).toBeVisible();

    // Rename it: the link shows the new title.
    await row(page, 'Chapter 2').dblclick();
    const input = page.getByRole('textbox', { name: 'Section title' });
    await input.fill('Gamma');
    await input.press('Enter');
    await page.getByRole('link', { name: 'Story Maps' }).click();
    await expect(
      page.getByTestId('map-canvas').getByRole('button', { name: 'Chapter 2 — Gamma' }),
    ).toBeVisible();

    // Move it above Alpha: it becomes Chapter 1.
    await page.getByRole('link', { name: 'Manuscript' }).click();
    await row(page, 'Chapter 2').click();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(row(page, 'Chapter 1 — Gamma')).toBeVisible();
    await page.getByRole('link', { name: 'Story Maps' }).click();
    await expect(
      page.getByTestId('map-canvas').getByRole('button', { name: 'Chapter 1 — Gamma' }),
    ).toBeVisible();

    // Drag the last node; the position (and the link) survive a reload.
    const [map] = await storedMaps(request, book.id);
    const lastNode = page.getByTestId('map-node').last();
    const box = (await lastNode.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + 80, { steps: 8 });
    await page.mouse.up();
    await saved(page);
    const moved = (await lastNode.boundingBox())!;
    expect(Math.abs(moved.x - box.x)).toBeGreaterThan(60);

    const lastId = map!.data.nodes.at(-1)!.id;
    const [after] = await storedMaps(request, book.id);
    const before = map!.data.nodes.find((n) => n.id === lastId)!.position;
    const now = after!.data.nodes.find((n) => n.id === lastId)!.position;
    expect(now.x).not.toBe(before.x);

    await page.reload();
    await expect(page.getByTestId('map-node')).toHaveCount(8);
    const reloaded = (await page.getByTestId('map-node').last().boundingBox())!;
    expect(Math.abs(reloaded.x - moved.x)).toBeLessThan(2);
    expect(Math.abs(reloaded.y - moved.y)).toBeLessThan(2);
    await expect(
      page.getByTestId('map-canvas').getByRole('button', { name: 'Chapter 1 — Gamma' }),
    ).toBeVisible();
  });

  test('+ adds a child, edits are saved, and auto-layout left-to-right persists', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E maps child', async () => {});
    await page.goto(`/book/${book.id}/maps`);
    await createMapInUi(page, 'Blank');

    await page.getByRole('button', { name: 'Add node' }).click();
    const title = page.getByRole('textbox', { name: 'Title' });
    await title.fill('Root');
    await page.getByRole('button', { name: 'Add child node' }).click();
    await expect(page.getByTestId('map-node')).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Title' }).fill('Child');
    await page.getByRole('textbox', { name: 'Story time' }).fill('Spring 1923');

    await page.getByRole('button', { name: 'Auto-layout left to right' }).click();
    await saved(page);
    await expect
      .poll(async () => {
        const [map] = await storedMaps(request, book.id);
        const root = map!.data.nodes.find((n) => n.data.title === 'Root');
        const child = map!.data.nodes.find((n) => n.data.title === 'Child');
        return (
          map!.data.layoutDirection === 'LR' &&
          !!root &&
          !!child &&
          child.position.x > root.position.x
        );
      })
      .toBe(true);
    const [stored] = await storedMaps(request, book.id);
    expect(stored!.data.edges).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId('map-node')).toHaveCount(2);
    await expect(page.getByTestId('map-canvas')).toContainText('Spring 1923');
  });

  test('maps can be renamed, duplicated and deleted from the list', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E maps list', async () => {});
    await page.goto(`/book/${book.id}/maps`);
    await createMapInUi(page, 'Timeline');

    await page.getByRole('button', { name: /Actions for Timeline/ }).click();
    await page.getByRole('menuitem', { name: /Rename/ }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Backstory');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByRole('link', { name: /Backstory/ })).toBeVisible();

    await page.getByRole('button', { name: /Actions for Backstory/ }).click();
    await page.getByRole('menuitem', { name: /Duplicate/ }).click();
    await expect(page.getByRole('link', { name: /Backstory \(copy\)/ })).toBeVisible();
    expect((await storedMaps(request, book.id)).map((m) => m.title)).toEqual([
      'Backstory',
      'Backstory (copy)',
    ]);

    await page.getByRole('button', { name: /Actions for Backstory \(copy\)/ }).click();
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await page.getByRole('button', { name: 'Delete map' }).click();
    await expect(page.getByRole('link', { name: /Backstory \(copy\)/ })).toHaveCount(0);
    expect((await storedMaps(request, book.id)).map((m) => m.title)).toEqual(['Backstory']);
  });
});

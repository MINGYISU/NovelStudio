import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  editorOf,
  makePng,
  openSection,
  savedContent,
  seedBlocks,
  seedBook,
  seedText,
  uploadImage,
} from './helpers.ts';

const PNG = makePng(120, 80, [200, 120, 60]);

/** One entry per top-level block: `p:<text>` or `image`. */
async function layout(editor: Locator): Promise<string[]> {
  return editor.evaluate((el) =>
    Array.from(el.children).map((child) =>
      child.querySelector('figure')
        ? 'image'
        : `${child.tagName.toLowerCase()}:${child.textContent ?? ''}`,
    ),
  );
}

async function saved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
}

/** Pastes (or drops) data as if it came from the clipboard; `files` are made up in the page. */
async function pasteInto(
  editor: Locator,
  data: { html?: string; files?: { name: string; type: string; base64: string }[] },
): Promise<void> {
  await editor.evaluate((el, { html, files }) => {
    const transfer = new DataTransfer();
    if (html) transfer.setData('text/html', html);
    for (const f of files ?? []) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], f.name, { type: f.type }));
    }
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, data);
}

async function cursorAfter(page: Page, editor: Locator, chars: number): Promise<void> {
  await editor.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < chars; i++) await page.keyboard.press('ArrowRight');
}

test.describe('images in the text (M11)', () => {
  test('toolbar insert in the middle of a paragraph splits it; size and caption survive a reload', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image insert', async (add) => {
      await add('c1', 'chapter', null, 'Pictures');
    });
    await seedText(request, book.nodes.c1!.id, 'HelloWorld');
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await cursorAfter(page, editor, 5);

    await page.getByRole('button', { name: 'Insert image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert image' });
    await dialog.getByTestId('image-file-input').setInputFiles({
      name: 'harbour.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(editor.locator('figure')).toHaveCount(1);
    expect(await layout(editor)).toEqual(['p:Hello', 'image', 'p:World']);

    const bar = page.getByRole('toolbar', { name: 'Image options' });
    await bar.getByRole('button', { name: 'Small' }).click();
    await bar.getByRole('button', { name: 'Caption' }).click();
    await bar.getByLabel('Image caption').fill('A made-up harbour');
    await page.keyboard.press('Enter');
    await expect(editor.locator('figcaption')).toHaveText('A made-up harbour');
    await saved(page);

    const [, image] = await savedContent(request, book.nodes.c1!.id);
    expect(image).toMatchObject({
      type: 'image',
      attrs: { size: 'small', caption: 'A made-up harbour' },
    });
    expect(JSON.stringify(image)).not.toContain('src');

    await page.reload();
    const reloaded = editorOf(page);
    await expect(reloaded.locator('figcaption')).toHaveText('A made-up harbour');
    expect(await layout(reloaded)).toEqual(['p:Hello', 'image', 'p:World']);
    const media = reloaded.locator('figure img');
    await expect(media).toBeVisible();
    const box = await media.boundingBox();
    const column = await reloaded.boundingBox();
    // Small is about a third of the text column, and the image never wraps beside text.
    expect(box!.width).toBeLessThan(column!.width * 0.4);
    expect(box!.x + box!.width / 2).toBeCloseTo(column!.x + column!.width / 2, -1);
  });

  test('pasting an image file puts it on its own line', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E image paste', async (add) => {
      await add('c1', 'chapter', null, 'Paste');
    });
    await seedText(request, book.nodes.c1!.id, 'HelloWorld');
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await cursorAfter(page, editor, 5);

    await pasteInto(editor, {
      files: [{ name: 'shot.png', type: 'image/png', base64: PNG.toString('base64') }],
    });
    await expect(editor.locator('figure')).toHaveCount(1);
    expect(await layout(editor)).toEqual(['p:Hello', 'image', 'p:World']);

    // PRD scenario 17: Small, a caption, then a reload leaves it unchanged.
    const bar = page.getByRole('toolbar', { name: 'Image options' });
    await bar.getByRole('button', { name: 'Small' }).click();
    await bar.getByRole('button', { name: 'Caption' }).click();
    await bar.getByLabel('Image caption').fill('Pasted shot');
    await page.keyboard.press('Enter');
    await saved(page);
    const content = await savedContent(request, book.nodes.c1!.id);
    expect(content.map((n) => n.type)).toEqual(['paragraph', 'image', 'paragraph']);
    await page.reload();
    const reloaded = editorOf(page);
    expect(await layout(reloaded)).toEqual(['p:Hello', 'image', 'p:World']);
    await expect(reloaded.locator('figcaption')).toHaveText('Pasted shot');
    await expect(reloaded.locator('figure[data-size="small"]')).toHaveCount(1);
  });

  test('pasted HTML with a web image sends no request, leaves the image out and says so', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image html', async (add) => {
      await add('c1', 'chapter', null, 'Paste');
    });
    const outgoing: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('images.example.test')) {
        outgoing.push(url);
        return route.abort();
      }
      return route.continue();
    });
    page.on('request', (r) => {
      if (r.url().includes('images.example.test')) outgoing.push(r.url());
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.click();

    await pasteInto(editor, {
      html: '<p>Some words</p><p><img src="https://images.example.test/a.png"></p><picture><source srcset="https://images.example.test/b.webp"><img src="https://images.example.test/b.png"></picture>',
    });
    await expect(editor).toContainText('Some words');
    await expect(
      page.getByText(
        'Images in pasted web pages and documents are not copied. Paste or drop the image file itself.',
      ),
    ).toBeVisible();
    await page.waitForTimeout(300);
    expect(outgoing).toEqual([]);
    await expect(editor.locator('figure, img')).toHaveCount(0);
  });

  test('an image copied inside the book pastes again and keeps working', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image copy', async (add) => {
      await add('c1', 'chapter', null, 'Copy');
    });
    const asset = await uploadImage(request, book.id, PNG);
    await seedBlocks(request, book.nodes.c1!.id, ['Start', { image: asset, caption: 'Twice' }]);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await expect(editor.locator('figure img')).toBeVisible();

    // Select the image and copy it with the editor's own clipboard serialization.
    await editor.locator('figure img').click();
    const copied = await editor.evaluate((el) => {
      const transfer = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
      return transfer.getData('text/html');
    });
    expect(copied).toContain('data-ns-image');
    expect(copied).toContain(`data-asset-id="${asset}"`);
    expect(copied).toContain(`data-book-id="${book.id}"`);

    await editor.locator('p').first().click();
    await page.keyboard.press('End');
    await pasteInto(editor, { html: copied });
    await expect(editor.locator('figure')).toHaveCount(2);
    await saved(page);
    const content = await savedContent(request, book.nodes.c1!.id);
    expect(content.filter((n) => n.type === 'image').map((n) => n.attrs?.assetId)).toEqual([
      asset,
      asset,
    ]);
  });

  test('Replace keeps size and caption, and double-click opens the full image until Esc', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image replace', async (add) => {
      await add('c1', 'chapter', null, 'Replace');
    });
    const first = await uploadImage(request, book.id, PNG, 'first.png');
    const second = await uploadImage(
      request,
      book.id,
      makePng(90, 90, [20, 140, 80]),
      'second.png',
    );
    await request.put(`/api/nodes/${book.nodes.c1!.id}/content`, {
      data: {
        rev: 0,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Words' }] },
            { type: 'image', attrs: { assetId: first, size: 'small', caption: 'Keep me' } },
          ],
        },
      },
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.locator('figure img').click();
    await page
      .getByRole('toolbar', { name: 'Image options' })
      .getByRole('button', { name: 'Replace' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Replace image' });
    await expect(dialog.getByTestId('image-grid').locator('li')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Use second.png' }).click();
    await expect(editor.locator('figure img')).toHaveAttribute('src', new RegExp(second));
    await saved(page);
    const [, image] = await savedContent(request, book.nodes.c1!.id);
    expect(image!.attrs).toEqual({ assetId: second, size: 'small', caption: 'Keep me' });

    await editor.locator('figure img').dblclick();
    const overlay = page.getByRole('dialog');
    await expect(overlay.locator('img')).toBeVisible();
    expect(await overlay.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(90);
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('an image copied from another book is copied into this one when pasted', async ({
    page,
    request,
  }) => {
    const source = await seedBook(request, 'E2E source book', async (add) => {
      await add('c1', 'chapter', null, 'Source');
    });
    const target = await seedBook(request, 'E2E target book', async (add) => {
      await add('c1', 'chapter', null, 'Target');
    });
    const asset = await uploadImage(request, source.id, PNG);
    await seedBlocks(request, source.nodes.c1!.id, ['Words', { image: asset }]);
    await seedText(request, target.nodes.c1!.id, 'Target text');

    const from = await openSection(page, source.id, source.nodes.c1!.id);
    await from.locator('figure img').click();
    const copied = await from.evaluate((el) => {
      const transfer = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
      return transfer.getData('text/html');
    });

    const into = await openSection(page, target.id, target.nodes.c1!.id);
    await into.locator('p').first().click();
    await page.keyboard.press('End');
    await pasteInto(into, { html: copied });
    await expect(into.locator('figure img')).toBeVisible();
    await saved(page);
    const [, image] = await savedContent(request, target.nodes.c1!.id);
    expect(image!.attrs!.assetId).not.toBe(asset);
    const list = await request.get(`/api/books/${target.id}/assets`);
    expect(((await list.json()) as { assets: unknown[] }).assets).toHaveLength(1);
    expect((await request.get(`/assets/${target.id}/${image!.attrs!.assetId}`)).ok()).toBe(true);
    await expect
      .poll(() => into.locator('figure img').evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBe(120);
  });

  test('dragging an image lands it between paragraphs, and dropping a file inserts it at the drop point', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image drag', async (add) => {
      await add('c1', 'chapter', null, 'Drag');
    });
    const asset = await uploadImage(request, book.id, PNG);
    await seedBlocks(request, book.nodes.c1!.id, [
      'First paragraph',
      'Second paragraph',
      { image: asset },
    ]);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    const picture = editor.locator('figure img');
    await expect(picture).toBeVisible();
    await picture.click();
    const first = editor.locator('p').first();
    const from = (await picture.boundingBox())!;
    const to = (await first.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y - 20, { steps: 5 });
    await page.mouse.move(to.x + 30, to.y + 2, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(() => layout(editor))
      .toEqual(['image', 'p:First paragraph', 'p:Second paragraph']);
    await saved(page);
    const content = await savedContent(request, book.nodes.c1!.id);
    expect(content.map((n) => n.type)).toEqual(['image', 'paragraph', 'paragraph']);

    // A file dropped into the middle of a paragraph splits it there.
    const second = editor.locator('p').nth(1);
    const box = (await second.boundingBox())!;
    await editor.evaluate(
      (el, { x, y, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
        el.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: transfer,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { x: box.x + 60, y: box.y + box.height / 2, base64: PNG.toString('base64') },
    );
    await expect(editor.locator('figure')).toHaveCount(2);
    const blocks = await layout(editor);
    expect(blocks.filter((b) => b === 'image')).toHaveLength(2);
    const text = blocks.filter((b) => b.startsWith('p:')).map((b) => b.slice(2));
    expect(text).toHaveLength(3);
    expect(text.join('')).toBe('First paragraphSecond paragraph');
  });

  test('removing an image can be undone, and a snapshot brings it back', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image undo', async (add) => {
      await add('c1', 'chapter', null, 'Undo');
    });
    const asset = await uploadImage(request, book.id, PNG);
    await seedBlocks(request, book.nodes.c1!.id, ['Words', { image: asset }, 'More words']);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.locator('figure img').click();
    await page.keyboard.press('Backspace');
    await expect(editor.locator('figure')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.locator('figure')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor.locator('figure')).toHaveCount(0);
    await saved(page);
    // The file stays in the book even though the text no longer uses it.
    expect((await request.get(`/assets/${book.id}/${asset}`)).ok()).toBe(true);

    await page.getByRole('button', { name: 'Snapshots' }).click();
    const dialog = page.getByRole('dialog', { name: 'Snapshots' });
    await dialog.getByRole('button').filter({ hasText: /Words/ }).first().click();
    await dialog.getByRole('button', { name: 'Restore this version' }).click();
    await expect(editor.locator('figure img')).toBeVisible();
    await expect(editor.locator('figure img')).toHaveJSProperty('complete', true);
    expect(
      await editor.locator('figure img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(120);
  });

  test('a missing file shows a placeholder and the reference stays', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E image missing', async (add) => {
      await add('c1', 'chapter', null, 'Missing');
    });
    await seedBlocks(request, book.nodes.c1!.id, [
      'Text',
      { image: '00000000-0000-4000-8000-000000000000' },
    ]);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await expect(editor.getByRole('img', { name: 'Image missing' })).toBeVisible();
    await editor.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' more');
    await saved(page);
    const content = await savedContent(request, book.nodes.c1!.id);
    expect(content[1]).toMatchObject({
      type: 'image',
      attrs: { assetId: '00000000-0000-4000-8000-000000000000' },
    });
  });

  test('Show images off collapses images to one-line placeholders with the caption', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E show images', async (add) => {
      await add('c1', 'chapter', null, 'Show');
    });
    const asset = await uploadImage(request, book.id, PNG);
    await seedBlocks(request, book.nodes.c1!.id, ['Text', { image: asset, caption: 'A lantern' }]);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await expect(editor.locator('figure img')).toBeVisible();

    await page.getByRole('button', { name: 'Display settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Display settings' });
    await dialog.getByLabel('Show images').uncheck();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await expect(editor.locator('figure img')).toBeHidden();
    await expect(editor.getByTestId('image-placeholder')).toHaveText('[Image: A lantern]');
    const content = await savedContent(request, book.nodes.c1!.id);
    expect(content).toHaveLength(2);
  });

  test('uploads are optimized to WebP unless Keep original is on, and the book lists its images', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E image optimize', async (add) => {
      await add('c1', 'chapter', null, 'Big');
    });
    const wide = makePng(2600, 200, [10, 90, 160], true);
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    await editor.click();

    const insert = async (keep: boolean) => {
      await page.getByRole('button', { name: 'Insert image' }).click();
      const dialog = page.getByRole('dialog', { name: 'Insert image' });
      const box = dialog.getByLabel('Keep original (do not resize or compress)');
      if (keep) await box.check();
      else await box.uncheck();
      await dialog
        .getByTestId('image-file-input')
        .setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: wide });
      await expect(dialog).toBeHidden();
    };
    await insert(false);
    await insert(true);
    await expect(editor.locator('figure')).toHaveCount(2);

    const list = await request.get(`/api/books/${book.id}/assets`);
    const { assets } = (await list.json()) as { assets: { mime: string; fileName: string }[] };
    expect(assets.map((a) => a.mime).sort()).toEqual(['image/png', 'image/webp']);
    expect(assets.find((a) => a.mime === 'image/webp')!.fileName).toBe('wide.webp');
    // The choice is remembered.
    await page.getByRole('button', { name: 'Insert image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert image' });
    await expect(dialog.getByLabel('Keep original (do not resize or compress)')).toBeChecked();
    await expect(dialog.getByTestId('image-grid').locator('li')).toHaveCount(2);
    await expect(dialog.getByTestId('image-total')).toContainText('Total size');
  });
});

test.describe('section header images (M11)', () => {
  test('a header image shows above the title, survives a reload, and is managed from the details panel', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E header', async (add) => {
      await add('c1', 'chapter', null, 'Headed');
    });
    const editor = await openSection(page, book.id, book.nodes.c1!.id);
    const title = page
      .getByRole('region', { name: 'Editor' })
      .getByRole('heading', { level: 2 })
      .filter({ hasText: 'Chapter 1' });

    await title.hover();
    await page
      .getByTestId('header-actions')
      .getByRole('button', { name: 'Add header image' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Header image' });
    await dialog
      .getByTestId('image-file-input')
      .setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: PNG });
    const header = page.getByTestId('header-image');
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    const titleBox = await title.boundingBox();
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(titleBox!.y + 1);

    await page.reload();
    await expect(page.getByTestId('header-image')).toBeVisible();
    await expect(editor).toBeVisible();

    const panel = page.getByRole('complementary');
    await expect(panel.getByRole('button', { name: 'Replace' })).toBeVisible();
    await panel.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('header-image')).toHaveCount(0);
    await expect(panel.getByText('No header image.')).toBeVisible();
    const res = await request.get(`/api/nodes/${book.nodes.c1!.id}`);
    const { node } = (await res.json()) as { node: { headerAssetId: string | null } };
    expect(node.headerAssetId).toBeNull();
  });

  test('a header image moves with its section', async ({ page, request }) => {
    const book = await seedBook(request, 'E2E header move', async (add) => {
      await add('c1', 'chapter', null, 'First');
      await add('c2', 'chapter', null, 'Second');
    });
    const asset = await uploadImage(request, book.id, PNG);
    const patch = await request.patch(`/api/nodes/${book.nodes.c2!.id}`, {
      data: { headerAssetId: asset },
    });
    expect(patch.ok()).toBe(true);
    const move = await request.post(`/api/nodes/${book.nodes.c2!.id}/move`, {
      data: { parentId: null, index: 0 },
    });
    expect(move.ok()).toBe(true);
    await openSection(page, book.id, book.nodes.c2!.id);
    await expect(page.getByTestId('header-image')).toBeVisible();
    await openSection(page, book.id, book.nodes.c1!.id);
    await expect(page.getByTestId('header-image')).toHaveCount(0);
  });
});

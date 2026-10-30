import { expect, test, type Page } from '@playwright/test';
import { editorOf, openBook, openSection, savedText, seedBook } from './helpers.ts';

/** Switches the language in Settings (an in-app route change, so a page marker survives). */
async function switchToChinese(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Library menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: '简体中文' }).check();
}

async function setLocaleFromPage(page: Page, locale: 'en' | 'zh-CN'): Promise<void> {
  await page.evaluate(async (next) => {
    // Vite serves the module the app already loaded, so this is the app's own store.
    const url = '/src/client/stores/locale.ts';
    const mod = (await import(/* @vite-ignore */ url)) as {
      useLocaleStore: { getState: () => { setLocale: (l: string) => void } };
    };
    mod.useLocaleStore.getState().setLocale(next);
  }, locale);
}

test.describe('interface language (M10)', () => {
  test('switching to 简体中文 translates every view and dialog without a reload, and is remembered', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E language', async (add) => {
      await add('c1', 'chapter', null, 'First');
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 1;
    });

    await switchToChinese(page);
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByRole('heading', { name: /Language · 语言/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'English' })).not.toBeChecked();
    await expect(page.getByRole('heading', { name: '冷备份' })).toBeVisible();

    // The library, in Chinese.
    await page.getByRole('link', { name: '书库' }).click();
    await expect(page.getByRole('heading', { name: '书库', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E language' })).toBeVisible();

    // All four workspace views, through the tabs.
    await page.getByRole('heading', { name: 'E2E language' }).click();
    const views = page.getByRole('navigation').first();
    for (const [label, path] of [
      ['故事图', 'maps'],
      ['伏笔', 'foreshadow'],
      ['设定集', 'codex'],
      ['正文', 'manuscript'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${path}`));
    }
    await expect(views).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manuscript' })).toHaveCount(0);

    // A dialog.
    await page.getByRole('button', { name: '结构' }).click();
    await expect(page.getByRole('dialog', { name: '结构设置' })).toBeVisible();
    await page.keyboard.press('Escape');

    // No reload happened, and the choice survives one.
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      1,
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByRole('link', { name: '设定集', exact: true })).toBeVisible();
    await openBook(page, book.id);
  });

  test('typing in a section, then switching the language right away, loses nothing', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E language text', async (add) => {
      await add('c1', 'chapter', null, 'First');
    });
    const section = book.nodes.c1!;
    await openSection(page, book.id, section.id);
    await editorOf(page).click();
    await page.keyboard.type('She did not look up.');

    await page.getByRole('link', { name: 'Library' }).first().click();
    await switchToChinese(page);
    await page.reload();

    await expect.poll(() => savedText(request, section.id)).toBe('She did not look up.');
    await openSection(page, book.id, section.id);
    await expect(editorOf(page)).toHaveText('She did not look up.');
    await expect(page.getByTestId('save-status')).toHaveText('已保存');
  });

  test('a language change does not remount the editor or touch what is typed', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E no remount', async (add) => {
      await add('c1', 'chapter', null, 'First');
    });
    await openSection(page, book.id, book.nodes.c1!.id);
    await editorOf(page).click();
    await page.keyboard.type('Unsaved words');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="editor"]') as
        (Element & { __kept?: boolean }) | null;
      if (el) el.__kept = true;
    });

    await setLocaleFromPage(page, 'zh-CN');

    await expect(page.getByRole('link', { name: '设定集', exact: true })).toBeVisible();
    await expect(editorOf(page)).toContainText('Unsaved words');
    expect(
      await page.evaluate(
        () =>
          (
            document.querySelector('[data-testid="editor"]') as
              (Element & { __kept?: boolean }) | null
          )?.__kept,
      ),
    ).toBe(true);
    await expect(page.getByTestId('save-status')).toHaveText('已保存');
    await expect.poll(() => savedText(request, book.nodes.c1!.id)).toBe('Unsaved words');
  });

  test('a book created in Chinese starts with 人物 and 第一章, and keeps them after switching back', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await switchToChinese(page);
    await page.getByRole('link', { name: '书库' }).click();

    await page.getByRole('button', { name: '新建' }).click();
    await page.getByRole('menuitem', { name: '新建空白作品…' }).click();
    await page.getByRole('textbox').first().fill('语言测试之书');
    await page.getByRole('button', { name: '创建' }).click();
    await expect(page.getByText('语言测试之书').first()).toBeVisible();

    const books = (await (await request.get('/api/books')).json()) as {
      books: { id: string; title: string }[];
    };
    const bookId = books.books.find((b) => b.title === '语言测试之书')!.id;
    const codex = (await (await request.get(`/api/books/${bookId}/codex`)).json()) as {
      categories: { name: string }[];
    };
    expect(codex.categories[0]!.name).toBe('人物');

    await request.post(`/api/books/${bookId}/nodes`, { data: { kind: 'chapter', parentId: null } });
    await page.goto(`/book/${bookId}/manuscript`);
    await expect(page.getByTestId('tree-row').first()).toContainText('第一章');

    // Switching back to English never rewrites what was created.
    await setLocaleFromPage(page, 'en');
    await expect(page.getByTestId('tree-row').first()).toContainText('第一章');
    await page.getByRole('link', { name: 'Codex', exact: true }).click();
    await expect(page.getByText('人物').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manuscript', exact: true })).toBeVisible();
  });
});

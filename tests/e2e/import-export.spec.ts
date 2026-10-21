import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { openBook, seedBook, seedText, visibleTitles } from './helpers.ts';

const FIVE_CHAPTERS = [
  '第一章 重逢',
  '他回来了。',
  '第二章 雨夜',
  '雨下了一夜。',
  '第三章 离别',
  '再见。',
  '第四章 归来',
  '又见面了。',
  '第五章 尾声',
  '结束。',
].join('\n');

async function openTextImport(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'Import text or Markdown…' }).click();
  return page.getByRole('dialog', { name: 'Import text or Markdown' });
}

test.describe('text and Markdown import (IMP-02, IMP-03, PRD scenario 15)', () => {
  test('a TXT with 第一章…第五章 previews five chapters and confirming creates them', async ({
    page,
  }) => {
    const dialog = await openTextImport(page);
    await dialog.getByLabel('Text file').setInputFiles({
      name: '夜雨集.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(FIVE_CHAPTERS, 'utf8'),
    });

    const sections = dialog.getByRole('list', { name: 'Detected sections' });
    await expect(sections.locator('li')).toHaveCount(5);
    await expect(
      dialog.getByRole('status').filter({ hasText: '5 sections detected' }),
    ).toBeVisible();
    await expect(sections.locator('li').first()).toContainText('重逢');
    await expect(dialog.getByLabel('Numbering style')).toHaveValue('chinese');
    // Nothing exists until the user confirms.
    const before = await page.request.get('/api/books');
    const stamp = ((await before.json()) as { books: { title: string }[] }).books.filter(
      (b) => b.title === '夜雨集',
    ).length;
    expect(stamp).toBe(0);

    await dialog.getByRole('button', { name: 'Import 5 sections' }).click();
    await expect(dialog.getByText('Imported “夜雨集” with 5 sections.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Open book' }).click();

    await expect
      .poll(() => visibleTitles(page))
      .toEqual(['第一章 重逢', '第二章 雨夜', '第三章 离别', '第四章 归来', '第五章 尾声']);
  });

  test('turning detection off previews one section, and cancelling imports nothing', async ({
    page,
  }) => {
    const dialog = await openTextImport(page);
    await dialog.getByLabel('Text file').setInputFiles({
      name: 'cancelled-novel.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(FIVE_CHAPTERS, 'utf8'),
    });
    const sections = dialog.getByRole('list', { name: 'Detected sections' });
    await expect(sections.locator('li')).toHaveCount(5);
    await dialog.getByLabel('Detect chapters').uncheck();
    await expect(sections.locator('li')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Import 1 section' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const res = await page.request.get('/api/books');
    const { books } = (await res.json()) as { books: { title: string }[] };
    expect(books.some((b) => b.title === 'cancelled-novel')).toBe(false);
  });

  test('Markdown headings become chapters', async ({ page }) => {
    const dialog = await openTextImport(page);
    await dialog.getByLabel('Text file').setInputFiles({
      name: 'md-draft.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Arrival\nA **bold** start.\n# Departure\nThe end.', 'utf8'),
    });
    const sections = dialog.getByRole('list', { name: 'Detected sections' });
    await expect(sections.locator('li')).toHaveCount(2);
    await expect(sections.locator('li').first()).toContainText('Arrival');
    await expect(dialog.getByLabel('Numbering style')).toHaveValue('english');
  });

  test('a file over 25 MB is refused with a warning before anything is uploaded', async ({
    page,
  }) => {
    const dialog = await openTextImport(page);
    await dialog.getByLabel('Text file').setInputFiles({
      name: 'huge.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(26 * 1024 * 1024, 0x61),
    });
    await expect(dialog.getByRole('alert')).toContainText('larger than 25 MB');
    await expect(dialog.getByRole('alert')).toContainText('nothing will be changed');
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  });
});

test.describe('manuscript export (EXP-01)', () => {
  test('downloads Markdown and plain text from the book menu, in reading order', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E export', async (add) => {
      await add('c1', 'chapter', null, 'Reunion');
      await add('c2', 'chapter', null, 'Rain');
      await add('gone', 'chapter', null, 'Dropped');
    });
    await seedText(request, book.nodes.c1!.id, 'First words.');
    await seedText(request, book.nodes.c2!.id, 'Second words.');
    await seedText(request, book.nodes.gone!.id, 'Never exported.');
    await request.delete(`/api/nodes/${book.nodes.gone!.id}`);
    await openBook(page, book.id);

    const read = async (item: string) => {
      await page.getByRole('button', { name: 'Book menu' }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('menuitem', { name: item }).click(),
      ]);
      const path = await download.path();
      return { name: download.suggestedFilename(), text: fs.readFileSync(path, 'utf8') };
    };

    const md = await read('Export Markdown');
    expect(md.name).toBe('E2E-export.md');
    expect(md.text).toContain('## Chapter 1 — Reunion\n\nFirst words.');
    expect(md.text.indexOf('Reunion')).toBeLessThan(md.text.indexOf('Rain'));
    expect(md.text).not.toContain('Never exported.');

    const txt = await read('Export plain text');
    expect(txt.name).toBe('E2E-export.txt');
    expect(txt.text).toContain('Chapter 2 — Rain\n\nSecond words.');
    expect(txt.text).not.toContain('Dropped');
  });
});

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedBook, seedText } from './helpers.ts';

let tmp: string;

test.beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-e2e-cold-'));
});
test.afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function card(page: Page, title: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
}

test.describe('cold backup', () => {
  test('set a folder in Settings, export from the library, and the reminder badge updates', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E cold export', async (add) => {
      await add('c1', 'chapter', null, 'Only chapter');
    });
    await seedText(request, book.nodes.c1!.id, 'Made-up words for the backup.');

    await page.goto('/settings');
    await page.getByRole('textbox', { name: 'Cold backup folder (absolute path)' }).fill(tmp);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('This folder is ready for cold backups.')).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto('/');
    const thisCard = card(page, 'E2E cold export');
    await expect(thisCard.getByTestId('backup-badge')).toHaveText('Never backed up');
    await thisCard.getByRole('button', { name: 'Menu for E2E cold export' }).click();
    await page.getByRole('menuitem', { name: 'Export cold backup…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Export' }).click();
    await expect(dialog.getByLabel('Export result')).toContainText('Verified');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(thisCard.getByTestId('backup-badge')).toContainText('Backed up');

    const folder = path.join(
      tmp,
      fs.readdirSync(tmp).find((n) => n.startsWith('E2E-cold-export__'))!,
    );
    const files = fs.readdirSync(folder);
    const json = files.find((n) => n.endsWith('.novelstudio.json'))!;
    expect(files).toContain(`${json}.sha256`);

    const bytes = fs.readFileSync(path.join(folder, json));
    const sidecar = fs.readFileSync(path.join(folder, `${json}.sha256`), 'utf8');
    expect(sidecar).toBe(`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${json}\n`);
    if (process.platform === 'darwin') {
      // The documented manual check, run for real.
      execFileSync('shasum', ['-a', '256', '-c', `${json}.sha256`], { cwd: folder });
    }
    const doc = JSON.parse(bytes.toString('utf8')) as {
      _readme: string;
      manuscript: { displayTitle: string; plainText: string }[];
    };
    expect(doc._readme).toMatch(/^NovelStudio cold backup/);
    expect(doc.manuscript[0]).toMatchObject({
      displayTitle: 'Chapter 1 — Only chapter',
      plainText: 'Made-up words for the backup.',
    });
  });

  test('exporting to a missing folder fails clearly and writes nothing', async ({
    page,
    request,
  }) => {
    await seedBook(request, 'E2E cold missing', async (add) => {
      await add('c1', 'chapter', null, 'One');
    });
    const missing = path.join(tmp, 'unplugged', 'drive');
    await page.goto('/');
    await card(page, 'E2E cold missing')
      .getByRole('button', { name: 'Menu for E2E cold missing' })
      .click();
    await page.getByRole('menuitem', { name: 'Export cold backup…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Another folder/ }).check();
    await dialog.getByRole('textbox', { name: 'Folder (absolute path)' }).fill(missing);
    await dialog.getByRole('button', { name: 'Export' }).click();
    await expect(dialog.getByRole('alert')).toContainText('is not available');
    expect(fs.existsSync(path.join(tmp, 'unplugged'))).toBe(false);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  test('imports a backup file as a new book, and offers "Import anyway" for a bad checksum', async ({
    page,
    request,
  }) => {
    const book = await seedBook(request, 'E2E cold import', async (add) => {
      await add('c1', 'chapter', null, 'Keep me');
    });
    await seedText(request, book.nodes.c1!.id, 'Words that must come back.');
    const exported = await request.post(`/api/books/${book.id}/cold-backup`, {
      data: { dir: tmp },
    });
    expect(exported.ok()).toBe(true);
    const { result } = (await exported.json()) as {
      result: { file: string; checksumFile: string };
    };

    await page.goto('/');
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('menuitem', { name: 'Import cold backup…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Backup file').setInputFiles(result.file);
    await dialog.getByLabel('Checksum file').setInputFiles(result.checksumFile);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Imported “E2E cold import (restored');
    await dialog.getByRole('button', { name: 'Open book' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /E2E cold import \(restored/ }),
    ).toBeVisible();
    await expect(page.getByLabel('Manuscript')).toContainText('Keep me');

    const tampered = path.join(tmp, 'tampered.novelstudio.json');
    fs.writeFileSync(tampered, fs.readFileSync(result.file, 'utf8').replace('Keep me', 'Kept me'));
    fs.writeFileSync(`${tampered}.sha256`, fs.readFileSync(result.checksumFile));
    await page.goto('/');
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('menuitem', { name: 'Import cold backup…' }).click();
    const again = page.getByRole('dialog');
    await again.getByLabel('Backup file').setInputFiles(tampered);
    await again.getByLabel('Checksum file').setInputFiles(`${tampered}.sha256`);
    await again.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(again.getByRole('alert')).toContainText('does not match');
    await again.getByRole('button', { name: 'Import anyway' }).click();
    await expect(again.getByRole('status')).toContainText('checksum');
  });
});

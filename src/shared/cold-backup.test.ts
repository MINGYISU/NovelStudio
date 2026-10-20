import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupTimestamp,
  BACKUP_FILE_PATTERN,
  bookFolderName,
  computeStats,
  isBackupOverdue,
  slugifyTitle,
} from './cold-backup.ts';
import type { ColdSection } from './schemas/cold-backup.ts';

describe('slugifyTitle', () => {
  it.each([
    ['My Novel', 'My-Novel'],
    ['  spaced   out  ', 'spaced-out'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j'],
    ['.hidden', '_hidden'],
    ['..', '__'],
    ['', 'untitled'],
    ['   ', 'untitled'],
    ['我的小说', '我的小说'],
    ['tab\there', 'tab_here'],
  ])('%j -> %j', (input, expected) => {
    expect(slugifyTitle(input)).toBe(expected);
  });

  it('trims to 60 characters without cutting a surrogate pair', () => {
    expect(slugifyTitle('x'.repeat(100))).toHaveLength(60);
    const slug = slugifyTitle('😀'.repeat(100));
    expect(Array.from(slug)).toHaveLength(60);
    expect(slug.endsWith('😀')).toBe(true);
  });

  it('normalizes to NFC', () => {
    expect(slugifyTitle('e\u0301')).toBe('\u00e9');
  });
});

describe('names', () => {
  const date = new Date('2026-10-20T18:49:09.400Z');

  it('formats UTC timestamps that sort chronologically', () => {
    expect(backupTimestamp(date)).toBe('2026-10-20_184909Z');
    expect(backupFileName(date, 'My Novel')).toBe('2026-10-20_184909Z__My-Novel.novelstudio.json');
    expect(backupFileName(date, 'My Novel', 2)).toBe(
      '2026-10-20_184909Z-2__My-Novel.novelstudio.json',
    );
  });

  it('names the book folder with the first 8 id characters', () => {
    expect(bookFolderName('我的小说', '3f2a9c1b-7d2e-4b8a-9c11-0a5b6e7f8d90')).toBe(
      '我的小说__3f2a9c1b',
    );
  });

  it('recognizes only backup files', () => {
    expect(BACKUP_FILE_PATTERN.test(backupFileName(date, 'x'))).toBe(true);
    expect(BACKUP_FILE_PATTERN.test(backupFileName(date, 'x', 3))).toBe(true);
    expect(BACKUP_FILE_PATTERN.test('notes.txt')).toBe(false);
    expect(BACKUP_FILE_PATTERN.test(backupFileName(date, 'x') + '.sha256')).toBe(false);
  });
});

describe('isBackupOverdue', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('is overdue when never backed up or older than the reminder window', () => {
    expect(isBackupOverdue(undefined, now, 7)).toBe(true);
    expect(isBackupOverdue('garbage', now, 7)).toBe(true);
    expect(isBackupOverdue('2026-10-12T11:59:00Z', now, 7)).toBe(true);
    expect(isBackupOverdue('2026-10-14T12:00:00Z', now, 7)).toBe(false);
  });
});

describe('computeStats', () => {
  it('counts nested sections, trash, words and the rest', () => {
    const section = (id: string, wordCount: number, children: ColdSection[] = []): ColdSection => ({
      id,
      kind: 'chapter',
      title: '',
      displayTitle: '',
      numbered: true,
      status: 'draft',
      synopsis: '',
      wordCount,
      plainText: '',
      content: null,
      rev: 0,
      createdAt: 'x',
      updatedAt: 'x',
      children,
    });
    const stats = computeStats({
      manuscript: [section('a', 10, [section('b', 5)]), section('c', 1)],
      trash: [{ ...section('d', 99, [section('e', 1)]), deletedAt: 'x', originalParentId: null }],
      codex: { categories: [], entries: [] },
      maps: [],
      foreshadows: [],
      assets: [],
      snapshots: null,
    });
    expect(stats).toMatchObject({ sections: 3, trashedSections: 2, words: 16, snapshots: 0 });
  });
});

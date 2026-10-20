import type { ColdBackupDoc, ColdBackupStats, ColdSection } from './schemas/cold-backup.ts';

/** Exact text from COLD_BACKUP_FORMAT §6. */
export const COLD_BACKUP_README = [
  'NovelStudio cold backup. This file is a complete, self-contained copy of one book.',
  "- 'manuscript' is the table of contents in reading order; 'children' holds nested sections.",
  "- Each section's readable text is in 'plainText'; 'content' is the same text with formatting (ProseMirror JSON).",
  "- 'displayTitle' shows the chapter number as it appeared when exported.",
  "- 'trash' holds deleted-but-recoverable sections; 'codex' holds characters and worldbuilding;",
  "  'maps' holds story diagrams; 'foreshadows' holds setup/payoff threads.",
  "- Images are in 'assets' as base64 ('dataBase64').",
  '- Restore with NovelStudio: Library > New > Import, or `npm run restore:cold -- <this file>`.',
  '- Format specification: docs/COLD_BACKUP_FORMAT.md in the NovelStudio repository.',
].join('\n');

export function walkSections(
  sections: readonly ColdSection[],
  visit: (s: ColdSection) => void,
): void {
  for (const section of sections) {
    visit(section);
    walkSections(section.children, visit);
  }
}

/** Counts a document so a freshly written file can be compared with what was meant to be written. */
export function computeStats(
  doc: Pick<
    ColdBackupDoc,
    'manuscript' | 'trash' | 'codex' | 'maps' | 'foreshadows' | 'assets' | 'snapshots'
  >,
): ColdBackupStats {
  let sections = 0;
  let words = 0;
  walkSections(doc.manuscript, (s) => {
    sections += 1;
    words += s.wordCount;
  });
  let trashedSections = 0;
  walkSections(doc.trash, () => {
    trashedSections += 1;
  });
  return {
    sections,
    trashedSections,
    words,
    codexCategories: doc.codex.categories.length,
    codexEntries: doc.codex.entries.length,
    maps: doc.maps.length,
    foreshadows: doc.foreshadows.length,
    occurrences: doc.foreshadows.reduce((n, f) => n + f.occurrences.length, 0),
    assets: doc.assets.length,
    snapshots: doc.snapshots?.length ?? 0,
  };
}

const SLUG_MAX = 60;

/** File and folder names only, never identity (COLD_BACKUP_FORMAT §2). */
export function slugifyTitle(title: string): string {
  const slug = Array.from(
    title
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '_')
      .replace(/^\.+/, (dots) => '_'.repeat(dots.length))
      .trim()
      .replace(/\s+/g, '-'),
  )
    .slice(0, SLUG_MAX)
    .join('');
  return slug === '' ? 'untitled' : slug;
}

export function bookFolderSuffix(bookId: string): string {
  return `__${bookId.slice(0, 8)}`;
}

export function bookFolderName(title: string, bookId: string): string {
  return slugifyTitle(title) + bookFolderSuffix(bookId);
}

/** `2026-10-20_184909Z`, UTC, so names sort chronologically. */
export function backupTimestamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 19).replace(/:/g, '')}Z`;
}

/** `attempt` > 1 only when two exports of one book land in the same second. */
export function backupFileName(date: Date, title: string, attempt = 1): string {
  const stamp = backupTimestamp(date) + (attempt > 1 ? `-${attempt}` : '');
  return `${stamp}__${slugifyTitle(title)}.novelstudio.json`;
}

export const BACKUP_FILE_SUFFIX = '.novelstudio.json';
export const CHECKSUM_SUFFIX = '.sha256';

/** Matches files this app wrote (retention only ever touches these). */
export const BACKUP_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{6}Z(?:-\d+)?__.*\.novelstudio\.json$/;

/** LIB-08 / COLD-10: a book is overdue when it was never backed up or the last backup is too old. */
export function isBackupOverdue(
  lastAt: string | undefined,
  now: Date,
  reminderDays: number,
): boolean {
  if (!lastAt) return true;
  const last = Date.parse(lastAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > reminderDays * 24 * 60 * 60 * 1000;
}

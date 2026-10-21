import Database from 'better-sqlite3';
import { loadMigrations } from './migrate.ts';

export type DatabaseCheck = { ok: true; schemaVersion: number } | { ok: false; reason: string };

/**
 * Opens a database file read-only and checks that it is a readable NovelStudio database this
 * version can run: SQLite integrity, a `books` table, and a schema that is not newer than ours.
 */
export function inspectDatabaseFile(file: string): DatabaseCheck {
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('quick_check', { simple: true });
    if (integrity !== 'ok')
      return { ok: false, reason: 'The file failed the SQLite integrity check.' };
    const schemaVersion = db.pragma('user_version', { simple: true }) as number;
    const hasBooks = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'books'")
      .get();
    if (!hasBooks) return { ok: false, reason: 'The file is not a NovelStudio database.' };
    const latest = loadMigrations().at(-1)?.version ?? 0;
    if (schemaVersion > latest) {
      return {
        ok: false,
        reason: `The backup uses schema ${schemaVersion}, newer than this app supports (${latest}).`,
      };
    }
    return { ok: true, schemaVersion };
  } catch {
    return { ok: false, reason: 'The file could not be opened as a database.' };
  } finally {
    db?.close();
  }
}

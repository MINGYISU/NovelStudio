import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDatabase(dbFile: string): Db {
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

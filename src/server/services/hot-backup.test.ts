import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../db/connection.ts';
import { loadMigrations, migrate } from '../db/migrate.ts';
import {
  HotBackupService,
  KEEP_BACKUPS,
  backupFileName,
  changedSinceLastBackup,
  createHotBackup,
  listBackups,
} from './hot-backup.ts';

let tmp: string;
let dbFile: string;
let backupsDir: string;
let db: Db;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
  dbFile = path.join(tmp, 'novelstudio.db');
  backupsDir = path.join(tmp, 'backups');
  db = openDatabase(dbFile);
  migrate(db);
  db.prepare(
    "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b', 'Made-up', 'x', 'x')",
  ).run();
});

afterEach(() => {
  vi.useRealTimers();
  if (db.open) db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('createHotBackup', () => {
  it('writes a consistent, openable copy named novelstudio-YYYYMMDD-HHmmss.db', () => {
    const file = createHotBackup(db, backupsDir, new Date(2026, 9, 20, 15, 4, 8));
    expect(path.basename(file)).toBe('novelstudio-20261020-150408.db');

    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT title FROM books').get()).toEqual({ title: 'Made-up' });
    expect(copy.pragma('user_version', { simple: true })).toBe(loadMigrations().length);
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();
  });

  it('never overwrites a backup made in the same second', () => {
    const now = new Date(2026, 9, 20, 15, 4, 8);
    const a = createHotBackup(db, backupsDir, now);
    const b = createHotBackup(db, backupsDir, now);
    expect(a).not.toBe(b);
    expect(fs.readdirSync(backupsDir)).toHaveLength(2);
  });

  it('leaves no temp files behind', () => {
    createHotBackup(db, backupsDir);
    expect(fs.readdirSync(backupsDir).every((f) => /^novelstudio-\d{8}-\d{6}\.db$/.test(f))).toBe(
      true,
    );
  });

  it(`keeps only the newest ${KEEP_BACKUPS}`, () => {
    const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
    for (let i = 0; i < KEEP_BACKUPS + 5; i++) {
      const file = createHotBackup(db, backupsDir, new Date(start + i * 60_000));
      const t = new Date(start + i * 60_000);
      fs.utimesSync(file, t, t);
    }
    const names = listBackups(backupsDir).map((b) => path.basename(b.file));
    expect(names).toHaveLength(KEEP_BACKUPS);
    expect(names).toContain(backupFileName(new Date(start + (KEEP_BACKUPS + 4) * 60_000)));
    expect(names).not.toContain(backupFileName(new Date(start)));
  });

  it('does not delete unrelated files in the backups folder', () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(path.join(backupsDir, 'notes.txt'), 'keep');
    for (let i = 0; i < KEEP_BACKUPS + 2; i++) {
      createHotBackup(db, backupsDir, new Date(2026, 0, 1, 0, i, 0));
    }
    expect(fs.existsSync(path.join(backupsDir, 'notes.txt'))).toBe(true);
  });
});

describe('HotBackupService', () => {
  it('backs up on start when no backup exists yet', () => {
    const service = new HotBackupService(db, dbFile, backupsDir);
    const file = service.runOnStart();
    expect(file).not.toBeNull();
    expect(listBackups(backupsDir)).toHaveLength(1);
  });

  it('skips the startup backup when nothing changed since the newest one', () => {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const service = new HotBackupService(db, dbFile, backupsDir);
    service.runOnStart();
    expect(changedSinceLastBackup(dbFile, backupsDir)).toBe(false);
    expect(service.runOnStart()).toBeNull();
    expect(listBackups(backupsDir)).toHaveLength(1);
  });

  it('backs up on start when the database changed after the newest backup', () => {
    const service = new HotBackupService(db, dbFile, backupsDir);
    const first = service.runOnStart()!;
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(first, past, past);

    db.prepare("UPDATE books SET title = 'Changed'").run();
    db.pragma('wal_checkpoint(TRUNCATE)');
    expect(service.runOnStart()).not.toBeNull();
    expect(listBackups(backupsDir)).toHaveLength(2);
  });

  it('runs the hourly backup only when marked dirty', () => {
    const service = new HotBackupService(db, dbFile, backupsDir);
    expect(service.runIfDirty()).toBeNull();
    service.markDirty();
    expect(service.runIfDirty()).not.toBeNull();
    expect(service.runIfDirty()).toBeNull();
    expect(listBackups(backupsDir)).toHaveLength(1);
  });

  it('keeps the dirty flag if a backup fails', () => {
    const service = new HotBackupService(db, dbFile, backupsDir);
    fs.writeFileSync(backupsDir, 'a file where the folder should be');
    service.markDirty();
    expect(() => service.runIfDirty()).toThrow();
    fs.rmSync(backupsDir);
    expect(service.runIfDirty()).not.toBeNull();
  });

  it('schedules the hourly check and stops cleanly', () => {
    vi.useFakeTimers();
    const service = new HotBackupService(db, dbFile, backupsDir);
    service.start(1000);
    service.markDirty();
    vi.advanceTimersByTime(1000);
    expect(listBackups(backupsDir)).toHaveLength(1);
    service.stop();
    service.markDirty();
    vi.advanceTimersByTime(5000);
    expect(listBackups(backupsDir)).toHaveLength(1);
  });
});

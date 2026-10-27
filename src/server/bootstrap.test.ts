import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDataStore, PendingRestoreError } from './bootstrap.ts';
import { DataDirError, realDataDir } from './config.ts';
import { loadMigrations } from './db/migrate.ts';
import { createHotBackup, listBackups } from './services/hot-backup.ts';
import { requestHotRestore } from './services/hot-backup-restore.ts';
import { LibraryService } from './services/library.ts';

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
  home = path.join(tmp, 'home');
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('openDataStore', () => {
  it('creates the data dir layout, migrates, and writes a hot backup on first start', () => {
    const dataDir = path.join(tmp, 'data');
    const store = openDataStore({
      env: { NODE_ENV: 'test', NOVEL_DATA_DIR: dataDir },
      homedir: home,
    });

    expect(store.paths.dataDir).toBe(dataDir);
    expect(fs.existsSync(path.join(dataDir, 'novelstudio.db'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'assets'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'config.json'))).toBe(true);
    expect(store.db.pragma('user_version', { simple: true })).toBe(loadMigrations().length);

    const backups = listBackups(path.join(dataDir, 'backups'));
    expect(backups).toHaveLength(1);
    expect(path.basename(backups[0]!.file)).toMatch(/^novelstudio-\d{8}-\d{6}\.db$/);
    store.close();
  });

  it('refuses to start in dev when NOVEL_DATA_DIR is the real dir, and touches nothing', () => {
    const real = realDataDir(home);
    expect(() =>
      openDataStore({ env: { NODE_ENV: 'development', NOVEL_DATA_DIR: real }, homedir: home }),
    ).toThrow(DataDirError);
    expect(fs.existsSync(real)).toBe(false);
    expect(fs.existsSync(path.join(home, 'Library'))).toBe(false);
  });

  it('refuses when NODE_ENV is unset and the override is the real dir', () => {
    expect(() =>
      openDataStore({ env: { NOVEL_DATA_DIR: realDataDir(home) }, homedir: home }),
    ).toThrow(DataDirError);
  });

  it('uses the real dir only in production (against a fake home)', () => {
    const store = openDataStore({ env: { NODE_ENV: 'production' }, homedir: home });
    expect(store.paths.dataDir).toBe(realDataDir(home));
    expect(listBackups(store.paths.backupsDir)).toHaveLength(1);
    store.close();
  });

  it('does not add a backup on a second start when nothing changed', () => {
    const env = { NODE_ENV: 'test', NOVEL_DATA_DIR: path.join(tmp, 'data') };
    openDataStore({ env, homedir: home }).close();
    const again = openDataStore({ env, homedir: home });
    expect(listBackups(again.paths.backupsDir)).toHaveLength(1);
    again.close();
  });

  it('refuses a database with a newer schema and does not modify it', () => {
    const env = { NODE_ENV: 'test', NOVEL_DATA_DIR: path.join(tmp, 'data') };
    const first = openDataStore({ env, homedir: home });
    first.db.pragma('user_version = 99');
    first.close();

    expect(() => openDataStore({ env, homedir: home })).toThrow(/newer than this app supports/);
  });

  it('does not overwrite a corrupt config.json', () => {
    const dataDir = path.join(tmp, 'data');
    fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'config.json'), 'oops');
    expect(() =>
      openDataStore({ env: { NODE_ENV: 'test', NOVEL_DATA_DIR: dataDir }, homedir: home }),
    ).toThrow(/config.json/);
    expect(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).toBe('oops');
  });
});

describe('a pending hot backup restore (HOT-02)', () => {
  function stagePending() {
    const env = { NODE_ENV: 'test', NOVEL_DATA_DIR: path.join(tmp, 'data') };
    const store = openDataStore({ env, homedir: home });
    const library = new LibraryService(store.db, store.paths);
    library.create({ title: 'Before' });
    const name = path.basename(
      createHotBackup(store.db, store.paths.backupsDir, new Date(2020, 0, 1)),
    );
    requestHotRestore(store.db, store.paths, name);
    library.create({ title: 'After' });
    return { env, store };
  }
  const titles = (store: ReturnType<typeof openDataStore>) =>
    (store.db.prepare('SELECT title FROM books ORDER BY title').all() as { title: string }[]).map(
      (r) => r.title,
    );

  it('is left alone by default: database files and marker stay untouched', () => {
    const { env, store: server } = stagePending();
    const dbFile = server.paths.dbFile;
    const files = [dbFile, `${dbFile}-wal`, `${dbFile}-shm`];
    const before = files.map((f) => fs.statSync(f).ino);
    const marker = path.join(server.paths.dataDir, 'pending-restore.json');
    const markerText = fs.readFileSync(marker, 'utf8');

    const script = openDataStore({ env, homedir: home });
    expect(script.pendingRestore?.name).toMatch(/^novelstudio-/);
    expect(titles(script)).toEqual(['After', 'Before']);
    expect(files.map((f) => fs.statSync(f).ino)).toEqual(before);
    expect(fs.readFileSync(marker, 'utf8')).toBe(markerText);
    expect(fs.existsSync(path.join(server.paths.dataDir, 'pending-restore.db'))).toBe(true);
    expect(fs.readdirSync(server.paths.backupsDir).some((n) => n.startsWith('replaced-'))).toBe(
      false,
    );
    script.close();
    server.close();
  });

  it('can be refused before the database is opened', () => {
    const { env, store } = stagePending();
    store.close();
    expect(() => openDataStore({ env, homedir: home, refuseIfRestorePending: true })).toThrow(
      PendingRestoreError,
    );
  });

  it('is applied when asked, as the server does', () => {
    const { env, store } = stagePending();
    store.close();
    const server = openDataStore({ env, homedir: home, applyPendingRestore: true });
    expect(server.pendingRestore).toBeNull();
    expect(titles(server)).toEqual(['Before']);
    expect(fs.existsSync(path.join(server.paths.dataDir, 'pending-restore.json'))).toBe(false);
    expect(fs.readdirSync(server.paths.backupsDir).some((n) => n.startsWith('replaced-'))).toBe(
      true,
    );
    server.close();
  });
});

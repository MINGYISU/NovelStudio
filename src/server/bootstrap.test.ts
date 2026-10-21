import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDataStore } from './bootstrap.ts';
import { DataDirError, realDataDir } from './config.ts';
import { loadMigrations } from './db/migrate.ts';
import { listBackups } from './services/hot-backup.ts';

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

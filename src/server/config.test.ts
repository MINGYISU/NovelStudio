import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigError,
  DataDirError,
  assertSafeDataDir,
  dataPaths,
  defaultConfig,
  readConfig,
  realDataDir,
  resolveDataDir,
  writeConfig,
} from './config.ts';

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

describe('resolveDataDir', () => {
  const cwd = '/work/repo';

  it('uses the real macOS dir in production when NOVEL_DATA_DIR is unset', () => {
    const dir = resolveDataDir({ env: { NODE_ENV: 'production' }, cwd, homedir: '/Users/me' });
    expect(dir).toBe('/Users/me/Library/Application Support/NovelStudio');
  });

  it('falls back to ./.data-dev outside production', () => {
    expect(resolveDataDir({ env: { NODE_ENV: 'development' }, cwd, homedir: '/Users/me' })).toBe(
      '/work/repo/.data-dev',
    );
    expect(resolveDataDir({ env: {}, cwd, homedir: '/Users/me' })).toBe('/work/repo/.data-dev');
  });

  it('lets NOVEL_DATA_DIR win in every mode', () => {
    for (const NODE_ENV of ['production', 'development', 'test']) {
      const dir = resolveDataDir({ env: { NODE_ENV, NOVEL_DATA_DIR: '/tmp/x' }, cwd });
      expect(dir).toBe('/tmp/x');
    }
  });

  it('resolves relative overrides against cwd and expands ~', () => {
    expect(resolveDataDir({ env: { NOVEL_DATA_DIR: './.data-dev' }, cwd })).toBe(
      '/work/repo/.data-dev',
    );
    expect(resolveDataDir({ env: { NOVEL_DATA_DIR: '~/Notes' }, cwd, homedir: '/Users/me' })).toBe(
      '/Users/me/Notes',
    );
  });

  it('ignores an empty NOVEL_DATA_DIR', () => {
    expect(
      resolveDataDir({ env: { NOVEL_DATA_DIR: '  ', NODE_ENV: 'production' }, cwd, homedir: '/h' }),
    ).toBe(realDataDir('/h'));
  });
});

describe('assertSafeDataDir (refuse-to-start guard)', () => {
  const dev = { NODE_ENV: 'development' };

  it('refuses the real data dir outside production', () => {
    const real = realDataDir(home);
    expect(() => assertSafeDataDir(real, { env: dev, homedir: home })).toThrow(DataDirError);
    expect(() => assertSafeDataDir(real, { env: { NODE_ENV: 'test' }, homedir: home })).toThrow(
      DataDirError,
    );
    expect(() => assertSafeDataDir(real, { env: {}, homedir: home })).toThrow(DataDirError);
  });

  it('refuses spelling variants: trailing slash, dot segments, case', () => {
    const real = realDataDir(home);
    for (const variant of [
      real + '/',
      path.join(real, 'sub', '..'),
      path.join(home, 'Library', 'Application Support', '.', 'NovelStudio'),
      real.toUpperCase(),
    ]) {
      expect(() => assertSafeDataDir(variant, { env: dev, homedir: home })).toThrow(DataDirError);
    }
  });

  it('refuses a dir inside the real data dir', () => {
    const inside = path.join(realDataDir(home), 'backups');
    expect(() => assertSafeDataDir(inside, { env: dev, homedir: home })).toThrow(DataDirError);
  });

  it('refuses a symlink that points at the real data dir', () => {
    const real = realDataDir(home);
    fs.mkdirSync(real, { recursive: true });
    const link = path.join(tmp, 'sneaky');
    fs.symlinkSync(real, link);
    expect(() => assertSafeDataDir(link, { env: dev, homedir: home })).toThrow(DataDirError);
    expect(() => assertSafeDataDir(path.join(link, 'x'), { env: dev, homedir: home })).toThrow(
      DataDirError,
    );
  });

  it('refuses through a symlinked parent even if the real dir does not exist yet', () => {
    const link = path.join(tmp, 'libLink');
    fs.mkdirSync(path.join(home, 'Library'), { recursive: true });
    fs.symlinkSync(path.join(home, 'Library'), link);
    const viaLink = path.join(link, 'Application Support', 'NovelStudio');
    expect(() => assertSafeDataDir(viaLink, { env: dev, homedir: home })).toThrow(DataDirError);
  });

  it('allows dev and temp directories', () => {
    expect(() =>
      assertSafeDataDir(path.join(tmp, 'data'), { env: dev, homedir: home }),
    ).not.toThrow();
    expect(() =>
      assertSafeDataDir(path.join(home, 'Library', 'Application Support', 'NovelStudio-dev'), {
        env: dev,
        homedir: home,
      }),
    ).not.toThrow();
  });

  it('allows the real dir in production', () => {
    expect(() =>
      assertSafeDataDir(realDataDir(home), { env: { NODE_ENV: 'production' }, homedir: home }),
    ).not.toThrow();
  });
});

describe('config.json', () => {
  it('returns defaults when the file is missing', () => {
    expect(readConfig(tmp)).toEqual(defaultConfig());
    expect(defaultConfig().coldBackup.dir).toBeNull();
    expect(defaultConfig().coldBackup.reminderDays).toBe(7);
  });

  it('round-trips a written config', () => {
    const config = defaultConfig();
    config.coldBackup.dir = '/Volumes/Backup/NovelStudio Cold Backups';
    config.coldBackup.last['book-1'] = { at: '2026-10-20T18:49:09.400Z', file: '/Volumes/x.json' };
    writeConfig(tmp, config);
    expect(readConfig(tmp)).toEqual(config);
  });

  it('writes atomically and leaves no temp files behind', () => {
    writeConfig(tmp, defaultConfig());
    writeConfig(tmp, defaultConfig());
    expect(fs.readdirSync(tmp).filter((f) => f !== 'home')).toEqual(['config.json']);
  });

  it('throws on corrupt JSON and does not touch the file', () => {
    const file = dataPaths(tmp).configFile;
    fs.writeFileSync(file, '{ not json');
    expect(() => readConfig(tmp)).toThrow(ConfigError);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ not json');
  });

  it('throws on schema violations', () => {
    fs.writeFileSync(dataPaths(tmp).configFile, JSON.stringify({ configVersion: 2 }));
    expect(() => readConfig(tmp)).toThrow(ConfigError);
  });

  it('refuses to write an invalid config', () => {
    const bad = defaultConfig();
    bad.coldBackup.reminderDays = -1;
    expect(() => writeConfig(tmp, bad)).toThrow();
    expect(fs.existsSync(dataPaths(tmp).configFile)).toBe(false);
  });
});

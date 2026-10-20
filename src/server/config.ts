import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appConfigSchema, type AppConfig } from '../shared/schemas/config.ts';

export class DataDirError extends Error {
  override name = 'DataDirError';
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homedir?: string;
}

export function realDataDir(homedir: string = os.homedir()): string {
  return path.join(homedir, 'Library', 'Application Support', 'NovelStudio');
}

function expandHome(p: string, homedir: string): string {
  if (p === '~') return homedir;
  if (p.startsWith('~/')) return path.join(homedir, p.slice(2));
  return p;
}

/** NOVEL_DATA_DIR always wins; otherwise production uses the real dir and everything else ./.data-dev. */
export function resolveDataDir(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homedir = options.homedir ?? os.homedir();

  const override = env.NOVEL_DATA_DIR?.trim();
  if (override) return path.resolve(cwd, expandHome(override, homedir));
  if (env.NODE_ENV === 'production') return realDataDir(homedir);
  return path.resolve(cwd, '.data-dev');
}

// Resolves symlinks for the longest existing prefix so not-yet-created dirs are compared correctly.
export function canonicalize(p: string): string {
  let existing = path.resolve(p);
  const rest: string[] = [];
  for (;;) {
    try {
      existing = fs.realpathSync.native(existing);
      break;
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) break;
      rest.unshift(path.basename(existing));
      existing = parent;
    }
  }
  let full = path.join(existing, ...rest);
  full = full.replace(/^\/System\/Volumes\/Data(?=\/)/, '');
  return full.toLowerCase();
}

export function isSameOrInside(candidate: string, container: string): boolean {
  const rel = path.relative(container, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Refuse-to-start guard (ARCHITECTURE §4): non-production runs must never touch the real data dir. */
export function assertSafeDataDir(dataDir: string, options: ResolveOptions = {}): void {
  const env = options.env ?? process.env;
  if (env.NODE_ENV === 'production') return;

  const homedir = options.homedir ?? os.homedir();
  const real = canonicalize(realDataDir(homedir));
  if (isSameOrInside(canonicalize(dataDir), real)) {
    throw new DataDirError(
      `Refusing to start: NODE_ENV is "${env.NODE_ENV ?? ''}" and the data directory "${dataDir}" ` +
        `is the real NovelStudio data directory. Use a dev or temp directory instead.`,
    );
  }
}

export interface DataPaths {
  dataDir: string;
  dbFile: string;
  backupsDir: string;
  assetsDir: string;
  configFile: string;
}

export function dataPaths(dataDir: string): DataPaths {
  return {
    dataDir,
    dbFile: path.join(dataDir, 'novelstudio.db'),
    backupsDir: path.join(dataDir, 'backups'),
    assetsDir: path.join(dataDir, 'assets'),
    configFile: path.join(dataDir, 'config.json'),
  };
}

export function ensureDataDir(dataDir: string): DataPaths {
  const paths = dataPaths(dataDir);
  fs.mkdirSync(paths.backupsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.assetsDir, { recursive: true, mode: 0o700 });
  return paths;
}

/** Write to a temp file, fsync, rename over the target, fsync the directory. */
export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } catch (err) {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.closeSync(fd);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
}

export function defaultConfig(): AppConfig {
  return appConfigSchema.parse({});
}

/** A missing file yields defaults; an unreadable or invalid file throws and is never overwritten. */
export function readConfig(dataDir: string): AppConfig {
  const file = dataPaths(dataDir).configFile;
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError(`config.json is not valid JSON: ${file}`);
  }
  const parsed = appConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new ConfigError(`config.json failed validation (${file}): ${parsed.error.message}`);
  }
  return parsed.data;
}

export function writeConfig(dataDir: string, config: AppConfig): void {
  const valid = appConfigSchema.parse(config);
  writeFileAtomic(dataPaths(dataDir).configFile, JSON.stringify(valid, null, 2) + '\n');
}

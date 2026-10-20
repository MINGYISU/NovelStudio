import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalize, isSameOrInside, realDataDir, type DataPaths } from '../config.ts';
import { ApiError } from '../errors.ts';

export const LOCATION_UNAVAILABLE = 'COLD_BACKUP_LOCATION_UNAVAILABLE';
export const LOCATION_INVALID = 'COLD_BACKUP_LOCATION_INVALID';

/** The source folder: three levels above this file in both `src/server/services` and `dist/server/services`. */
export function defaultRepoRoot(): string {
  return path.resolve(import.meta.dirname, '..', '..', '..');
}

export interface LocationContext {
  paths: DataPaths;
  repoRoot?: string;
  homedir?: string;
}

export interface CheckedLocation {
  /** Absolute, normalized path. */
  dir: string;
  /** False when the folder does not exist yet; the first export creates it (its parent must exist). */
  exists: boolean;
}

/** Policy only (COLD-01): absolute, and never inside the data directory or the source folder. */
export function assertLocationAllowed(dir: string, ctx: LocationContext): string {
  if (!path.isAbsolute(dir)) {
    throw new ApiError(400, LOCATION_INVALID, 'The cold backup folder must be an absolute path.');
  }
  const resolved = path.resolve(dir);
  const candidate = canonicalize(resolved);
  const forbidden: [string, string][] = [
    [ctx.paths.dataDir, 'the NovelStudio data directory'],
    [realDataDir(ctx.homedir ?? os.homedir()), 'the NovelStudio data directory'],
    [ctx.repoRoot ?? defaultRepoRoot(), 'the NovelStudio source folder'],
  ];
  for (const [root, label] of forbidden) {
    if (isSameOrInside(candidate, canonicalize(root))) {
      throw new ApiError(
        400,
        LOCATION_INVALID,
        `The cold backup folder cannot be inside ${label}. Choose a different folder, ideally on another disk.`,
      );
    }
  }
  return resolved;
}

function unavailable(message: string): ApiError {
  return new ApiError(409, LOCATION_UNAVAILABLE, message);
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Full check before an export: allowed, exists (or its parent exists so it can be created) and is
 * writable. It never creates the folder itself, so a failed check leaves nothing behind.
 */
export function checkLocation(dir: string, ctx: LocationContext): CheckedLocation {
  const resolved = assertLocationAllowed(dir, ctx);

  if (fs.existsSync(resolved)) {
    if (!isDirectory(resolved)) throw unavailable(`"${resolved}" is not a folder.`);
    const probe = path.join(resolved, `.novelstudio-probe-${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(probe, 'probe', { flag: 'wx' });
      fs.rmSync(probe, { force: true });
    } catch {
      fs.rmSync(probe, { force: true });
      throw unavailable(`The cold backup folder "${resolved}" is not writable.`);
    }
    return { dir: resolved, exists: true };
  }

  const parent = path.dirname(resolved);
  if (!isDirectory(parent)) {
    throw unavailable(
      `The cold backup folder "${resolved}" is not available. Is the drive connected?`,
    );
  }
  try {
    fs.accessSync(parent, fs.constants.W_OK);
  } catch {
    throw unavailable(`"${parent}" is not writable, so the cold backup folder cannot be created.`);
  }
  return { dir: resolved, exists: false };
}

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, type DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { inspectDatabaseFile } from '../db/inspect.ts';
import { ApiError } from '../errors.ts';
import { createHotBackup, isBackupName, listBackups } from './hot-backup.ts';

const STAGED_DB = 'pending-restore.db';
const PENDING_MARKER = 'pending-restore.json';
const FAILED_MARKER = 'pending-restore.failed.json';

const markerSchema = z.object({
  name: z.string(),
  requestedAt: z.string(),
  error: z.string().optional(),
});
export type RestoreMarker = z.infer<typeof markerSchema>;

export interface HotBackupInfo {
  name: string;
  bytes: number;
  createdAt: string;
}

export interface HotBackupState {
  backups: HotBackupInfo[];
  /** A restore that will be applied the next time the server starts. */
  pending: RestoreMarker | null;
  /** The newest restore that could not be applied at startup, with the reason. */
  failed: RestoreMarker | null;
}

function readMarker(file: string): RestoreMarker | null {
  try {
    const parsed = markerSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function hotBackupState(paths: DataPaths): HotBackupState {
  return {
    backups: listBackups(paths.backupsDir).map((b) => ({
      name: path.basename(b.file),
      bytes: fs.statSync(b.file).size,
      createdAt: new Date(b.mtimeMs).toISOString(),
    })),
    pending: readMarker(path.join(paths.dataDir, PENDING_MARKER)),
    failed: readMarker(path.join(paths.dataDir, FAILED_MARKER)),
  };
}

function removeStaged(paths: DataPaths): void {
  fs.rmSync(path.join(paths.dataDir, STAGED_DB), { force: true });
}

/**
 * HOT-02, step 1. The chosen backup is validated and copied aside (so retention can never delete it),
 * the live database gets a fresh hot backup, and a marker is written. Nothing is replaced while the
 * server is running; {@link applyPendingRestore} does the swap at the next start.
 */
export function requestHotRestore(
  db: Db,
  paths: DataPaths,
  name: string,
  now: Date = new Date(),
): RestoreMarker {
  if (!isBackupName(name)) throw new ApiError(400, 'VALIDATION_ERROR', 'Not a hot backup name.');
  const source = path.join(paths.backupsDir, name);
  if (!fs.existsSync(source)) throw new ApiError(404, 'NOT_FOUND', 'Backup not found.');

  const check = inspectDatabaseFile(source);
  if (!check.ok) throw new ApiError(409, 'BACKUP_UNUSABLE', check.reason);

  const staged = path.join(paths.dataDir, STAGED_DB);
  const tmp = path.join(paths.dataDir, `.${STAGED_DB}.tmp`);
  fs.rmSync(tmp, { force: true });
  try {
    fs.copyFileSync(source, tmp);
    fs.renameSync(tmp, staged);
    const copy = inspectDatabaseFile(staged);
    if (!copy.ok) throw new ApiError(500, 'RESTORE_STAGING_FAILED', copy.reason);
    createHotBackup(db, paths.backupsDir, now);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    removeStaged(paths);
    throw err;
  }

  const marker: RestoreMarker = { name, requestedAt: now.toISOString() };
  writeFileAtomic(path.join(paths.dataDir, PENDING_MARKER), JSON.stringify(marker, null, 2) + '\n');
  fs.rmSync(path.join(paths.dataDir, FAILED_MARKER), { force: true });
  return marker;
}

/** Withdraws a pending restore, or dismisses the notice about a failed one. */
export function cancelHotRestore(paths: DataPaths): void {
  fs.rmSync(path.join(paths.dataDir, PENDING_MARKER), { force: true });
  fs.rmSync(path.join(paths.dataDir, FAILED_MARKER), { force: true });
  removeStaged(paths);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function replacedDir(backupsDir: string, now: Date): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let dir = path.join(backupsDir, `replaced-${stamp}`);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(backupsDir, `replaced-${stamp}-${i}`);
  return dir;
}

export type ApplyOutcome = { status: 'none' } | { status: 'applied' | 'failed'; message: string };

/**
 * HOT-02, step 2. Runs at startup BEFORE the database is opened. The old database files (with their
 * WAL, so no committed text is lost) are moved into `backups/replaced-<time>/`, never deleted; then
 * the staged copy takes their place. A problem keeps the current database and records why.
 */
export function applyPendingRestore(paths: DataPaths, now: Date = new Date()): ApplyOutcome {
  const markerFile = path.join(paths.dataDir, PENDING_MARKER);
  if (!fs.existsSync(markerFile)) return { status: 'none' };
  const marker = readMarker(markerFile);
  const staged = path.join(paths.dataDir, STAGED_DB);

  const fail = (error: string): ApplyOutcome => {
    writeFileAtomic(
      path.join(paths.dataDir, FAILED_MARKER),
      JSON.stringify(
        { name: marker?.name ?? 'unknown', requestedAt: marker?.requestedAt ?? '', error },
        null,
        2,
      ) + '\n',
    );
    fs.rmSync(markerFile, { force: true });
    removeStaged(paths);
    return { status: 'failed', message: error };
  };

  if (!marker) return fail('The restore request could not be read.');
  if (!fs.existsSync(staged)) {
    // A crash after the swap but before the marker was removed: the restore already happened.
    fs.rmSync(markerFile, { force: true });
    return { status: 'applied', message: `Restore of ${marker.name} was already applied.` };
  }
  const check = inspectDatabaseFile(staged);
  if (!check.ok) return fail(check.reason);

  const parts = [paths.dbFile, `${paths.dbFile}-wal`, `${paths.dbFile}-shm`].filter((f) =>
    fs.existsSync(f),
  );
  const moved: [string, string][] = [];
  try {
    if (parts.length > 0) {
      const dir = replacedDir(paths.backupsDir, now);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (const f of parts) {
        const to = path.join(dir, path.basename(f));
        fs.renameSync(f, to);
        moved.push([f, to]);
      }
    }
    fs.renameSync(staged, paths.dbFile);
  } catch (err) {
    // Put the current database back so a failed swap never leaves the app without one.
    for (const [from, to] of moved.reverse()) {
      try {
        fs.renameSync(to, from);
      } catch {
        // nothing more can be done; the files remain in backups/replaced-*
      }
    }
    return fail(`The files could not be swapped: ${(err as Error).message}`);
  }
  fs.rmSync(markerFile, { force: true });
  return { status: 'applied', message: `Restored the database from ${marker.name}.` };
}

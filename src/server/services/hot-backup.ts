import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/connection.ts';

export const KEEP_BACKUPS = 20;
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

const BACKUP_NAME = /^novelstudio-\d{8}-\d{6}\.db$/;

export function isBackupName(name: string): boolean {
  return BACKUP_NAME.test(name);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function backupFileName(date: Date): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `novelstudio-${d}-${t}.db`;
}

export function listBackups(backupsDir: string): { file: string; mtimeMs: number }[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((f) => BACKUP_NAME.test(f))
    .map((f) => ({
      file: path.join(backupsDir, f),
      mtimeMs: fs.statSync(path.join(backupsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file));
}

export function pruneBackups(backupsDir: string, keep: number = KEEP_BACKUPS): void {
  for (const old of listBackups(backupsDir).slice(keep)) fs.rmSync(old.file, { force: true });
}

/** Consistent copy of the live database (VACUUM INTO) written under a temp name, then renamed. */
export function createHotBackup(db: Db, backupsDir: string, now: Date = new Date()): string {
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });

  // Names have 1 s resolution; never overwrite an existing backup.
  let stamp = new Date(now);
  let target = path.join(backupsDir, backupFileName(stamp));
  while (fs.existsSync(target)) {
    stamp = new Date(stamp.getTime() + 1000);
    target = path.join(backupsDir, backupFileName(stamp));
  }

  const tmp = path.join(backupsDir, `.${path.basename(target)}.tmp`);
  fs.rmSync(tmp, { force: true });
  try {
    db.prepare('VACUUM INTO ?').run(tmp);
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  pruneBackups(backupsDir);
  return target;
}

/** True if the database (or a non-empty WAL) was modified after the newest backup, or no backup exists. */
export function changedSinceLastBackup(dbFile: string, backupsDir: string): boolean {
  const newest = listBackups(backupsDir)[0];
  if (!newest) return true;

  let latest = fs.statSync(dbFile).mtimeMs;
  const wal = `${dbFile}-wal`;
  if (fs.existsSync(wal)) {
    const s = fs.statSync(wal);
    if (s.size > 0) latest = Math.max(latest, s.mtimeMs);
  }
  return latest > newest.mtimeMs;
}

export class HotBackupService {
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly dbFile: string,
    private readonly backupsDir: string,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  /** Repos call this after every write so the hourly run knows there is something to back up. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Startup backup, skipped only when nothing changed since the newest existing backup. */
  runOnStart(): string | null {
    // Fold the WAL into the main file first so its mtime reflects real changes only.
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    if (!changedSinceLastBackup(this.dbFile, this.backupsDir)) return null;
    return this.backup();
  }

  runIfDirty(): string | null {
    if (!this.dirty) return null;
    return this.backup();
  }

  start(intervalMs: number = BACKUP_INTERVAL_MS): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.runIfDirty();
      } catch (err) {
        this.log('Hourly hot backup failed', err);
      }
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private backup(): string {
    // Clear first so writes that land during the backup keep the flag set.
    this.dirty = false;
    try {
      return createHotBackup(this.db, this.backupsDir);
    } catch (err) {
      this.dirty = true;
      throw err;
    }
  }
}

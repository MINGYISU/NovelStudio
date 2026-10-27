import fs from 'node:fs';
import { appConfigSchema, type AppConfig } from '../shared/schemas/config.ts';
import {
  assertSafeDataDir,
  ensureDataDir,
  readConfig,
  resolveDataDir,
  writeConfig,
  type DataPaths,
  type ResolveOptions,
} from './config.ts';
import { openDatabase, type Db } from './db/connection.ts';
import { migrate } from './db/migrate.ts';
import { createHotBackup, HotBackupService } from './services/hot-backup.ts';
import {
  applyPendingRestore,
  pendingHotRestore,
  type RestoreMarker,
} from './services/hot-backup-restore.ts';

export const PENDING_RESTORE_MESSAGE =
  'A hot backup restore is waiting for the next start. Restart NovelStudio (or cancel the restore in Settings) first.';

/** Thrown before the database is opened when a script must not run while a restore is pending. */
export class PendingRestoreError extends Error {
  override name = 'PendingRestoreError';

  constructor() {
    super(PENDING_RESTORE_MESSAGE);
  }
}

export interface OpenDataStoreOptions extends ResolveOptions {
  log?: (msg: string, err?: unknown) => void;
  /**
   * Applies a staged hot backup restore (HOT-02) before opening the database. Only the server
   * does this; a CLI script swapping the files would pull them from under a running server.
   */
  applyPendingRestore?: boolean;
  /** Throws `PendingRestoreError` instead of opening when a restore is pending. */
  refuseIfRestorePending?: boolean;
}

export interface DataStore {
  paths: DataPaths;
  config: AppConfig;
  db: Db;
  hotBackup: HotBackupService;
  /** A restore still waiting for the next server start (never set when it was just applied). */
  pendingRestore: RestoreMarker | null;
  close(): void;
}

/**
 * Resolves the data dir, enforces the refuse-to-start guard BEFORE touching the disk,
 * then opens the database, migrates it (hot backup first) and takes the startup backup.
 */
export function openDataStore(options: OpenDataStoreOptions = {}): DataStore {
  const dataDir = resolveDataDir(options);
  assertSafeDataDir(dataDir, options);

  const paths = ensureDataDir(dataDir);
  if (options.applyPendingRestore) {
    const restore = applyPendingRestore(paths);
    if (restore.status !== 'none') {
      options.log?.(`Hot backup restore ${restore.status}: ${restore.message}`);
    }
  }
  const pendingRestore = pendingHotRestore(paths);
  if (pendingRestore && options.refuseIfRestorePending) throw new PendingRestoreError();
  const configExisted = fs.existsSync(paths.configFile);
  const config = readConfig(dataDir);
  if (!configExisted) writeConfig(dataDir, appConfigSchema.parse(config));

  const db = openDatabase(paths.dbFile);
  try {
    migrate(db, {
      beforeMigrate: () => {
        createHotBackup(db, paths.backupsDir);
      },
    });
    const hotBackup = new HotBackupService(db, paths.dbFile, paths.backupsDir, options.log);
    hotBackup.runOnStart();
    return {
      paths,
      config,
      db,
      hotBackup,
      pendingRestore,
      close: () => {
        hotBackup.stop();
        db.close();
      },
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

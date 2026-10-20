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

export interface DataStore {
  paths: DataPaths;
  config: AppConfig;
  db: Db;
  hotBackup: HotBackupService;
  close(): void;
}

/**
 * Resolves the data dir, enforces the refuse-to-start guard BEFORE touching the disk,
 * then opens the database, migrates it (hot backup first) and takes the startup backup.
 */
export function openDataStore(
  options: ResolveOptions & { log?: (msg: string, err?: unknown) => void } = {},
): DataStore {
  const dataDir = resolveDataDir(options);
  assertSafeDataDir(dataDir, options);

  const paths = ensureDataDir(dataDir);
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection.ts';

export class SchemaTooNewError extends Error {
  override name = 'SchemaTooNewError';
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const defaultMigrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));

export function loadMigrations(dir: string = defaultMigrationsDir): Migration[] {
  const migrations = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(file);
      if (!match) throw new Error(`Invalid migration file name: ${file}`);
      return {
        version: Number(match[1]),
        name: file,
        sql: fs.readFileSync(path.join(dir, file), 'utf8'),
      };
    });
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migrations must be numbered 001.. without gaps; found ${m.name} at #${i + 1}`,
      );
    }
  });
  return migrations;
}

export interface MigrateOptions {
  migrations?: Migration[];
  /** Called once, before any change, when an existing (non-empty) database is about to be upgraded. */
  beforeMigrate?: (info: { from: number; to: number }) => void;
}

export function getSchemaVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Applies pending migrations, each in its own transaction together with its user_version bump. */
export function migrate(db: Db, options: MigrateOptions = {}): { from: number; to: number } {
  const migrations = options.migrations ?? loadMigrations();
  const latest = migrations.at(-1)?.version ?? 0;
  const current = getSchemaVersion(db);

  if (current > latest) {
    throw new SchemaTooNewError(
      `Database schema version ${current} is newer than this app supports (${latest}). ` +
        `Refusing to start to avoid damaging your data; use a newer version of NovelStudio.`,
    );
  }
  if (current === latest) return { from: current, to: current };

  if (current > 0) options.beforeMigrate?.({ from: current, to: latest });

  for (const m of migrations.filter((x) => x.version > current)) {
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return { from: current, to: latest };
}

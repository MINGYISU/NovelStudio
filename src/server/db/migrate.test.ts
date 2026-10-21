import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.ts';
import { SchemaTooNewError, getSchemaVersion, loadMigrations, migrate } from './migrate.ts';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .sort();
}

const ALL_TABLES = [
  'assets',
  'books',
  'codex_categories',
  'codex_entries',
  'foreshadow_occurrences',
  'foreshadows',
  'maps',
  'nodes',
  'snapshots',
];

describe('migrate', () => {
  it('builds the schema from an empty database', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    const result = migrate(db);

    expect(result).toEqual({ from: 0, to: loadMigrations().length });
    expect(getSchemaVersion(db)).toBe(loadMigrations().length);
    expect(tableNames(db)).toEqual(ALL_TABLES);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('002 adds the codex tables to a version-1 database without touching existing rows', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    const [first] = loadMigrations();
    migrate(db, { migrations: [first!] });
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b1', 'Keep me', 'x', 'x')",
    ).run();
    db.prepare(
      `INSERT INTO nodes (id, book_id, kind, title, position, content, created_at, updated_at)
       VALUES ('n1', 'b1', 'chapter', 'Ch', 0, '{"type":"doc","content":[]}', 'x', 'x')`,
    ).run();

    expect(migrate(db)).toEqual({ from: 1, to: loadMigrations().length });
    expect(tableNames(db)).toEqual(ALL_TABLES);
    expect(db.prepare('SELECT title FROM books').get()).toEqual({ title: 'Keep me' });
    expect(db.prepare('SELECT title FROM nodes').get()).toEqual({ title: 'Ch' });
    db.close();
  });

  it('003 adds the maps table to a version-2 database without touching existing rows', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    migrate(db, { migrations: loadMigrations().slice(0, 2) });
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b1', 'Keep me', 'x', 'x')",
    ).run();
    db.prepare(
      `INSERT INTO codex_categories (id, book_id, name, position) VALUES ('c1', 'b1', 'People', 0)`,
    ).run();
    expect(tableNames(db)).not.toContain('maps');

    expect(migrate(db)).toEqual({ from: 2, to: loadMigrations().length });
    expect(tableNames(db)).toEqual(ALL_TABLES);
    expect(db.prepare('SELECT name FROM codex_categories').get()).toEqual({ name: 'People' });
    db.prepare(
      `INSERT INTO maps (id, book_id, title, template, data, position, created_at, updated_at)
       VALUES ('m1', 'b1', 'Map', 'blank', '{}', 0, 'x', 'x')`,
    ).run();
    db.prepare("DELETE FROM books WHERE id = 'b1'").run();
    db.prepare('DELETE FROM codex_categories').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM maps').get()).toEqual({ n: 0 });
    db.close();
  });

  it('004 adds the foreshadow tables to a version-3 database without touching existing rows', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    migrate(db, { migrations: loadMigrations().slice(0, 3) });
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b1', 'Keep me', 'x', 'x')",
    ).run();
    db.prepare(
      `INSERT INTO maps (id, book_id, title, template, data, position, created_at, updated_at)
       VALUES ('m1', 'b1', 'Map', 'blank', '{}', 0, 'x', 'x')`,
    ).run();
    expect(tableNames(db)).not.toContain('foreshadows');

    expect(migrate(db)).toEqual({ from: 3, to: loadMigrations().length });
    expect(tableNames(db)).toEqual(ALL_TABLES);
    expect(db.prepare('SELECT title FROM maps').get()).toEqual({ title: 'Map' });
    db.prepare(
      `INSERT INTO foreshadows (id, book_id, title, created_at, updated_at)
       VALUES ('f1', 'b1', 'Thread', 'x', 'x')`,
    ).run();
    expect(db.prepare('SELECT status, color FROM foreshadows').get()).toEqual({
      status: 'planned',
      color: '#c0841a',
    });
    expect(() =>
      db
        .prepare(
          `INSERT INTO foreshadow_occurrences (id, foreshadow_id, role, created_at)
           VALUES ('o1', 'f1', 'bogus', 'x')`,
        )
        .run(),
    ).toThrow();
    db.prepare(
      `INSERT INTO foreshadow_occurrences (id, foreshadow_id, role, created_at)
       VALUES ('o1', 'f1', 'setup', 'x')`,
    ).run();
    db.prepare("DELETE FROM books WHERE id = 'b1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM foreshadows').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM foreshadow_occurrences').get()).toEqual({ n: 0 });
    db.close();
  });

  it('does not take a pre-migration backup for a brand new database', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    let called = 0;
    migrate(db, { beforeMigrate: () => void called++ });
    expect(called).toBe(0);
    db.close();
  });

  it('is a no-op when already up to date', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    migrate(db);
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b1', 'Keep me', 'x', 'x')",
    ).run();
    const latest = loadMigrations().length;
    expect(migrate(db)).toEqual({ from: latest, to: latest });
    expect(db.prepare('SELECT title FROM books').get()).toEqual({ title: 'Keep me' });
    db.close();
  });

  it('enforces foreign keys and the node kind check', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    migrate(db);
    const insert = db.prepare(
      `INSERT INTO nodes (id, book_id, kind, position, created_at, updated_at)
       VALUES (?, ?, ?, 0, 'x', 'x')`,
    );
    expect(() => insert.run('n1', 'missing-book', 'chapter')).toThrow(/FOREIGN KEY/);
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b', 't', 'x', 'x')",
    ).run();
    expect(() => insert.run('n2', 'b', 'bogus')).toThrow(/CHECK/);
    db.close();
  });

  it('refuses a database whose schema is newer than the app and leaves it untouched', () => {
    const file = path.join(tmp, 'novelstudio.db');
    const db = openDatabase(file);
    migrate(db);
    db.pragma('user_version = 99');

    expect(() => migrate(db)).toThrow(SchemaTooNewError);
    expect(getSchemaVersion(db)).toBe(99);
    expect(tableNames(db)).toEqual(ALL_TABLES);
    db.close();
  });

  it('upgrades an existing database, calling beforeMigrate first and once', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    const [first] = loadMigrations();
    migrate(db, { migrations: [first!] });
    db.prepare(
      "INSERT INTO books (id, title, created_at, updated_at) VALUES ('b', 't', 'x', 'x')",
    ).run();

    const migrations = [
      first!,
      { version: 2, name: '002_extra.sql', sql: 'CREATE TABLE extra (id TEXT PRIMARY KEY);' },
      { version: 3, name: '003_more.sql', sql: 'CREATE TABLE more (id TEXT PRIMARY KEY);' },
    ];
    const calls: unknown[] = [];
    migrate(db, { migrations, beforeMigrate: (info) => calls.push(info) });

    expect(calls).toEqual([{ from: 1, to: 3 }]);
    expect(getSchemaVersion(db)).toBe(3);
    expect(tableNames(db)).toContain('more');
    db.close();
  });

  it('rolls a failing migration back completely and keeps the old version', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    const [first] = loadMigrations();
    migrate(db, { migrations: [first!] });

    const broken = [
      first!,
      {
        version: 2,
        name: '002_broken.sql',
        sql: 'CREATE TABLE half_done (id TEXT); INSERT INTO no_such_table VALUES (1);',
      },
    ];
    expect(() => migrate(db, { migrations: broken })).toThrow();
    expect(getSchemaVersion(db)).toBe(1);
    expect(tableNames(db)).not.toContain('half_done');
    db.close();
  });

  it('aborts without migrating when the pre-migration backup fails', () => {
    const db = openDatabase(path.join(tmp, 'novelstudio.db'));
    const [first] = loadMigrations();
    migrate(db, { migrations: [first!] });
    const next = [first!, { version: 2, name: '002_x.sql', sql: 'CREATE TABLE x (id TEXT);' }];

    expect(() =>
      migrate(db, {
        migrations: next,
        beforeMigrate: () => {
          throw new Error('disk full');
        },
      }),
    ).toThrow('disk full');
    expect(getSchemaVersion(db)).toBe(1);
    db.close();
  });

  it('rejects migration sets with gaps or bad names', () => {
    const dir = path.join(tmp, 'migrations');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dir, '003_c.sql'), 'SELECT 1;');
    expect(() => loadMigrations(dir)).toThrow(/without gaps/);
    fs.writeFileSync(path.join(dir, 'oops.sql'), 'SELECT 1;');
    expect(() => loadMigrations(dir)).toThrow(/Invalid migration file name/);
  });
});

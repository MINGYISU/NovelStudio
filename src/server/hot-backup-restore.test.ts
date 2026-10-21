import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HotBackupStateResponse } from '../shared/schemas/hot-backup.ts';
import { createHotBackup, KEEP_BACKUPS } from './services/hot-backup.ts';
import { Harness } from './test-support.ts';

let h: Harness;
beforeEach(async () => {
  h = await new Harness().start();
});
afterEach(async () => {
  await h.cleanup();
});

const state = async () => (await h.api('GET', '/api/hot-backups')).json<HotBackupStateResponse>();
const titles = async () =>
  (await h.api('GET', '/api/books'))
    .json<{ books: { title: string }[] }>()
    .books.map((b) => b.title);
const restore = (name: string) => h.api('POST', `/api/hot-backups/${name}/restore`);

/** A backup of the database as it is right now, named by a fake clock so names never collide. */
let tick = 0;
function backupNow(): string {
  tick += 1;
  const file = createHotBackup(
    h.store.db,
    h.store.paths.backupsDir,
    new Date(2026, 0, 1, 0, 0, tick),
  );
  return path.basename(file);
}

describe('hot backup list (HOT-02)', () => {
  it('lists backups newest first with size and time, and no pending restore', async () => {
    await h.createBook('One');
    const name = backupNow();
    const body = await state();
    expect(body.pending).toBeNull();
    expect(body.failed).toBeNull();
    const entry = body.backups.find((b) => b.name === name);
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(Date.parse(entry!.createdAt)).not.toBeNaN();
    expect(body.backups.length).toBeGreaterThanOrEqual(1);
  });
});

describe('restoring a hot backup (HOT-02)', () => {
  it('stages the restore, leaves the live database alone, and applies it at the next start', async () => {
    await h.createBook('Before');
    const name = backupNow();
    await h.createBook('After');

    const res = await restore(name);
    expect(res.statusCode).toBe(200);
    expect(res.json().pending.name).toBe(name);
    expect((await state()).pending?.name).toBe(name);
    // Nothing is replaced while the server runs.
    expect((await titles()).sort()).toEqual(['After', 'Before']);
    // The current database was hot-backed-up first.
    const safety = (await state()).backups.filter((b) => b.name !== name);
    expect(safety.length).toBeGreaterThan(0);

    await h.restart();
    expect(await titles()).toEqual(['Before']);
    expect((await state()).pending).toBeNull();
    expect(fs.existsSync(path.join(h.dataDir, 'pending-restore.db'))).toBe(false);

    // The replaced database is kept, with its WAL, and still holds the newer book.
    const replaced = fs
      .readdirSync(h.store.paths.backupsDir)
      .filter((f) => f.startsWith('replaced-'));
    expect(replaced).toHaveLength(1);
    const old = new Database(path.join(h.store.paths.backupsDir, replaced[0]!, 'novelstudio.db'), {
      readonly: true,
    });
    try {
      expect(old.prepare('SELECT title FROM books ORDER BY title').all()).toEqual([
        { title: 'After' },
        { title: 'Before' },
      ]);
    } finally {
      old.close();
    }

    // The fresh pre-restore backup also still holds "After".
    const withAfter = (await state()).backups.filter((b) => {
      const db = new Database(path.join(h.store.paths.backupsDir, b.name), { readonly: true });
      try {
        return db.prepare("SELECT 1 FROM books WHERE title = 'After'").get() !== undefined;
      } finally {
        db.close();
      }
    });
    expect(withAfter.length).toBeGreaterThan(0);
  });

  it('keeps working after the restore: new writes persist', async () => {
    await h.createBook('Before');
    const name = backupNow();
    await h.createBook('After');
    await restore(name);
    await h.restart();
    await h.createBook('Later');
    await h.restart();
    expect((await titles()).sort()).toEqual(['Before', 'Later']);
  });

  it('refuses a bad name, a missing file, a corrupt file and a newer schema', async () => {
    expect((await restore('..%2Fevil.db')).statusCode).toBe(400);
    expect((await restore('notabackup.db')).statusCode).toBe(400);
    expect((await restore('novelstudio-20200101-000000.db')).statusCode).toBe(404);

    const corrupt = 'novelstudio-20200101-000001.db';
    fs.writeFileSync(path.join(h.store.paths.backupsDir, corrupt), 'this is not sqlite');
    const bad = await restore(corrupt);
    expect(bad.statusCode).toBe(409);
    expect(bad.json().error.code).toBe('BACKUP_UNUSABLE');

    const good = backupNow();
    const newer = 'novelstudio-20200101-000002.db';
    fs.copyFileSync(
      path.join(h.store.paths.backupsDir, good),
      path.join(h.store.paths.backupsDir, newer),
    );
    const db = new Database(path.join(h.store.paths.backupsDir, newer));
    db.pragma('user_version = 999');
    db.close();
    const tooNew = await restore(newer);
    expect(tooNew.statusCode).toBe(409);
    expect(tooNew.json().error.message).toContain('newer');

    expect((await state()).pending).toBeNull();
    expect(fs.existsSync(path.join(h.dataDir, 'pending-restore.db'))).toBe(false);
  });

  it('can be cancelled before the restart', async () => {
    await h.createBook('Before');
    const name = backupNow();
    await h.createBook('After');
    await restore(name);
    const cancelled = await h.api('DELETE', '/api/hot-backups/pending-restore');
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().pending).toBeNull();
    await h.restart();
    expect((await titles()).sort()).toEqual(['After', 'Before']);
  });

  it('keeps the current database and reports why when the staged file went bad', async () => {
    await h.createBook('Before');
    const name = backupNow();
    await h.createBook('After');
    await restore(name);
    fs.writeFileSync(path.join(h.dataDir, 'pending-restore.db'), 'damaged');
    await h.restart();
    expect((await titles()).sort()).toEqual(['After', 'Before']);
    const body = await state();
    expect(body.pending).toBeNull();
    expect(body.failed?.error).toBeTruthy();
    await h.api('DELETE', '/api/hot-backups/pending-restore');
    expect((await state()).failed).toBeNull();
  });

  it('survives retention: restoring the oldest backup still works after the list is pruned', async () => {
    await h.createBook('Before');
    const oldest = backupNow();
    for (let i = 0; i < KEEP_BACKUPS - 1; i++) backupNow();
    await h.createBook('After');
    expect((await state()).backups.some((b) => b.name === oldest)).toBe(true);

    expect((await restore(oldest)).statusCode).toBe(200);
    // The safety backup pushed the oldest one out of the keep-20 list ...
    expect((await state()).backups.some((b) => b.name === oldest)).toBe(false);
    // ... but the staged copy still restores it.
    await h.restart();
    expect(await titles()).toEqual(['Before']);
  });

  it('does not lose a restore whose swap already happened (crash before the marker was removed)', async () => {
    await h.createBook('Before');
    const name = backupNow();
    await restore(name);
    await h.restart();
    fs.writeFileSync(
      path.join(h.dataDir, 'pending-restore.json'),
      JSON.stringify({ name, requestedAt: new Date().toISOString() }),
    );
    await h.restart();
    expect(await titles()).toEqual(['Before']);
    expect((await state()).pending).toBeNull();
    expect((await state()).failed).toBeNull();
  });
});

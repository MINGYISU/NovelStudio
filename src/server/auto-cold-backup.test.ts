import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from './config.ts';
import { ColdBackupService } from './services/cold-backup.ts';
import { Harness, paragraphs } from './test-support.ts';

let h: Harness;
let coldDir: string;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let clock: number;

beforeEach(async () => {
  clock = new Date(2026, 9, 21, 10, 0, 0).getTime();
  vi.useFakeTimers({ toFake: ['Date'], now: clock });
  h = await new Harness().start();
  coldDir = path.join(h.tmp, 'cold');
  fs.mkdirSync(coldDir);
});
afterEach(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

function advance(ms: number): void {
  clock += ms;
  vi.setSystemTime(clock);
}

const service = () =>
  new ColdBackupService({ db: h.store.db, paths: h.store.paths, homedir: h.home });

const enable = (extra: object = {}) =>
  h.api('PUT', '/api/settings/cold-backup', { autoDaily: true, dir: coldDir, ...extra });

/** Every `.novelstudio.json` under the cold folder. */
function backupFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.novelstudio.json')) out.push(full);
    }
  };
  walk(coldDir);
  return out;
}

async function bookWithText(title: string, text = 'Words.') {
  const book = await h.createBook(title);
  const node = await h.createNode(book.id, 'chapter', null, 'One');
  await h.saveContent(node.id, paragraphs(text), 0);
  return { book, node };
}

describe('automatic daily cold backup (COLD-11)', () => {
  it('is off by default and does nothing', async () => {
    await bookWithText('A');
    expect(service().runAutoDaily()).toBeNull();
    expect(backupFiles()).toHaveLength(0);
    expect(readConfig(h.dataDir).coldBackup.autoDailyLast).toBeNull();
  });

  it('can be switched on and off through the settings API', async () => {
    const res = await enable();
    expect(res.json().settings).toMatchObject({ autoDaily: true, dir: coldDir });
    const off = await h.api('PUT', '/api/settings/cold-backup', { autoDaily: false });
    expect(off.json().settings.autoDaily).toBe(false);
  });

  it('backs up books that changed, once per day', async () => {
    await bookWithText('A');
    await bookWithText('B');
    await enable();
    advance(HOUR);

    const first = service().runAutoDaily();
    expect(first).toMatchObject({ ok: true, message: 'Backed up 2 changed books.' });
    expect(backupFiles()).toHaveLength(2);
    expect(readConfig(h.dataDir).coldBackup.autoDailyLast).toMatchObject({
      date: '2026-10-21',
      ok: true,
    });

    advance(HOUR);
    expect(service().runAutoDaily()?.date).toBe('2026-10-21');
    expect(backupFiles()).toHaveLength(2);
  });

  it('skips unchanged books on later days and backs up the ones edited since', async () => {
    const a = await bookWithText('A');
    await bookWithText('B');
    await enable();
    advance(HOUR);
    service().runAutoDaily();
    expect(backupFiles()).toHaveLength(2);

    advance(DAY);
    expect(service().runAutoDaily()).toMatchObject({
      ok: true,
      message: 'No books changed since their last cold backup.',
    });
    expect(backupFiles()).toHaveLength(2);

    const rev = (await h.api('GET', `/api/nodes/${a.node.id}`)).json().node.rev as number;
    await h.saveContent(a.node.id, paragraphs('Edited words.'), rev);
    advance(DAY);
    expect(service().runAutoDaily()).toMatchObject({
      ok: true,
      message: 'Backed up 1 changed book.',
    });
    const files = backupFiles();
    expect(files).toHaveLength(3);
    // Older backups are never overwritten or removed.
    expect(files.filter((f) => f.includes(`__${a.book.id.slice(0, 8)}`))).toHaveLength(2);
  });

  it('leaves trashed books out', async () => {
    const a = await bookWithText('A');
    await bookWithText('B');
    await h.api('DELETE', `/api/books/${a.book.id}`);
    await enable();
    advance(HOUR);
    service().runAutoDaily();
    expect(backupFiles()).toHaveLength(1);
  });

  it('records a visible failure and writes nothing when the folder is unavailable, then retries', async () => {
    await bookWithText('A');
    const missing = path.join(h.tmp, 'unplugged', 'drive', 'cold');
    await enable({ dir: missing });
    advance(HOUR);

    const failed = service().runAutoDaily();
    expect(failed?.ok).toBe(false);
    expect(failed?.message).toContain('Not backed up');
    expect(fs.existsSync(path.join(h.tmp, 'unplugged'))).toBe(false);
    expect(readConfig(h.dataDir).coldBackup.autoDailyLast?.ok).toBe(false);
    const shown = (await h.api('GET', '/api/settings/cold-backup')).json();
    expect(shown.autoDailyLast).toMatchObject({ ok: false });

    // Plugging the drive in (here: pointing at a usable folder) succeeds at the next start, same day.
    await enable();
    advance(HOUR);
    expect(service().runAutoDaily()).toMatchObject({ ok: true });
    expect(backupFiles()).toHaveLength(1);
  });

  it('reports a missing folder setting instead of failing silently', async () => {
    await bookWithText('A');
    await h.api('PUT', '/api/settings/cold-backup', { autoDaily: true });
    const result = service().runAutoDaily();
    expect(result).toMatchObject({ ok: false });
    expect(result?.message).toContain('no cold backup folder');
  });

  it('retries only the books that failed and keeps the others', async () => {
    const a = await bookWithText('A');
    await bookWithText('B');
    await enable();
    advance(HOUR);

    // A plain file where the book's folder should be makes exactly that export fail.
    const blocker = path.join(coldDir, `A__${a.book.id.slice(0, 8)}`);
    fs.writeFileSync(blocker, 'a file where the book folder should be');
    const result = service().runAutoDaily();
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('"A"');
    expect(backupFiles()).toHaveLength(1);

    fs.rmSync(blocker);
    advance(HOUR);
    expect(service().runAutoDaily()).toMatchObject({
      ok: true,
      message: 'Backed up 1 changed book.',
    });
    expect(backupFiles()).toHaveLength(2);
  });
});

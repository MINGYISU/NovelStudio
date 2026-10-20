import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Harness, paragraphs } from '../test-support.ts';

const SCRIPTS = import.meta.dirname;
let h: Harness;
let out: string;

beforeEach(async () => {
  h = await new Harness().start();
  out = path.join(h.tmp, 'cold');
  fs.mkdirSync(out);
});
afterEach(async () => {
  await h.cleanup();
});

/** Runs a CLI script against a temp data dir; NODE_ENV=test means the real data dir is refused. */
function run(script: string, args: string[], dataDir = h.dataDir) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(SCRIPTS, script), ...args],
    {
      env: { ...process.env, NODE_ENV: 'test', NOVEL_DATA_DIR: dataDir, HOME: h.home },
      encoding: 'utf8',
    },
  );
  return { code: result.status, out: result.stdout + result.stderr };
}

describe('cold backup CLI (COLD-07)', () => {
  it('exports, verifies and restores into a fresh data directory', async () => {
    const book = await h.createBook('CLI Novel');
    const node = await h.createNode(book.id, 'chapter', null, 'One');
    await h.saveContent(node.id, paragraphs('Hello from the command line.'), 0);
    h.store.db.pragma('wal_checkpoint(TRUNCATE)');

    const exported = run('cold-backup.ts', ['--book', book.id, '--out', out]);
    expect(exported.code, exported.out).toBe(0);
    const folder = path.join(out, fs.readdirSync(out)[0]!);
    const file = path.join(
      folder,
      fs.readdirSync(folder).find((n) => n.endsWith('.json'))!,
    );

    const verified = run('verify-cold.ts', [file]);
    expect(verified.code, verified.out).toBe(0);
    expect(verified.out).toContain('OK');

    const freshDir = path.join(h.tmp, 'fresh-data');
    const restored = run('restore-cold.ts', [file, '--data-dir', freshDir], freshDir);
    expect(restored.code, restored.out).toBe(0);
    expect(restored.out).toContain('CLI Novel');
    expect(fs.existsSync(path.join(freshDir, 'novelstudio.db'))).toBe(true);

    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('command line', 'command lime'));
    expect(run('verify-cold.ts', [file]).code).toBe(1);
    const refused = run('restore-cold.ts', [file, '--data-dir', path.join(h.tmp, 'other-data')]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('--ignore-checksum');
  }, 60_000);

  it('fails clearly and writes nothing when the output folder is missing', async () => {
    await h.createBook('Nothing Written');
    const missing = path.join(h.tmp, 'unplugged', 'cold');
    const result = run('cold-backup.ts', ['--out', missing]);
    expect(result.code).toBe(1);
    expect(result.out).toContain('COLD_BACKUP_LOCATION_UNAVAILABLE');
    expect(fs.existsSync(path.join(h.tmp, 'unplugged'))).toBe(false);
  }, 60_000);

  it('refuses the real data directory when not in production', () => {
    const realish = path.join(h.home, 'Library', 'Application Support', 'NovelStudio');
    const result = run('cold-backup.ts', ['--out', out], realish);
    expect(result.code).toBe(1);
    expect(result.out).toContain('Refusing to start');
    expect(fs.existsSync(realish)).toBe(false);
  }, 60_000);
});

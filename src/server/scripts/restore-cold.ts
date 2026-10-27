import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openDataStore, PendingRestoreError } from '../bootstrap.ts';
import { DataDirError } from '../config.ts';
import { ApiError } from '../errors.ts';
import { restoreColdBackup } from '../services/cold-backup-restore.ts';

// `npm run restore:cold -- <file> [--data-dir <dir>] [--ignore-checksum]`
// Restores as a NEW book. Works without the UI or the server. The same data-directory guard as the
// server applies: without NODE_ENV=production or --data-dir this uses ./.data-dev.
try {
  const { values, positionals } = parseArgs({
    options: { 'data-dir': { type: 'string' }, 'ignore-checksum': { type: 'boolean' } },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (!file) {
    console.error('Usage: npm run restore:cold -- <file> [--data-dir <dir>] [--ignore-checksum]');
    process.exit(2);
  }
  const bytes = fs.readFileSync(file);
  let expected: string | null = null;
  try {
    const sidecar = fs.readFileSync(file + '.sha256', 'utf8');
    expected = /^([0-9a-f]{64})\b/i.exec(sidecar.trim())?.[1] ?? null;
  } catch {
    console.warn('No .sha256 file next to the backup; the checksum was not verified.');
  }

  const dataDir = values['data-dir'];
  const store = openDataStore({
    env: dataDir ? { ...process.env, NOVEL_DATA_DIR: path.resolve(dataDir) } : process.env,
    // A book restored now would disappear when the pending hot restore is applied at the next start.
    refuseIfRestorePending: true,
    log: (msg, err) => console.error(msg, err),
  });
  try {
    const result = restoreColdBackup(store.db, store.paths, bytes, {
      expectedSha256: expected,
      ignoreChecksum: values['ignore-checksum'],
    });
    console.log(`Restored "${result.book.title}" (${result.book.id}) into ${store.paths.dataDir}`);
    if (result.remapped) console.log('Some ids already existed, so every id was regenerated.');
    for (const w of result.warnings) console.warn(`  warning: ${w}`);
  } finally {
    store.close();
  }
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`${err.message} (${err.code})`);
    if (err.code === 'CHECKSUM_MISMATCH') console.error('Use --ignore-checksum to restore anyway.');
  } else {
    console.error(
      err instanceof DataDirError || err instanceof PendingRestoreError ? err.message : err,
    );
  }
  process.exit(1);
}

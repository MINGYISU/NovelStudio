import { parseArgs } from 'node:util';
import { openDataStore } from '../bootstrap.ts';
import { DataDirError } from '../config.ts';
import { ApiError } from '../errors.ts';
import { ColdBackupService } from '../services/cold-backup.ts';

// `npm run backup:cold -- [--book <id>] [--out <dir>] [--include-snapshots]`
// Without NODE_ENV=production or NOVEL_DATA_DIR this uses ./.data-dev, never the real data directory.
try {
  const { values } = parseArgs({
    options: {
      book: { type: 'string' },
      out: { type: 'string' },
      'include-snapshots': { type: 'boolean' },
    },
  });
  const store = openDataStore({ log: (msg, err) => console.error(msg, err) });
  let failed = false;
  try {
    const service = new ColdBackupService({ db: store.db, paths: store.paths });
    const options = {
      dir: values.out,
      includeSnapshots: values['include-snapshots'] ? true : undefined,
    };
    if (values.book) {
      const result = service.exportBook(values.book, options);
      console.log(`${result.title}: ${result.file}`);
      for (const w of result.warnings) console.warn(`  warning: ${w}`);
    } else {
      for (const r of service.exportAll(options).results) {
        if (r.ok) {
          console.log(`${r.title}: ${r.result.file}`);
          for (const w of r.result.warnings) console.warn(`  warning: ${w}`);
        } else {
          failed = true;
          console.error(`${r.title}: FAILED (${r.error.code}) ${r.error.message}`);
        }
      }
    }
  } finally {
    store.close();
  }
  if (failed) process.exit(1);
} catch (err) {
  console.error(
    err instanceof DataDirError || err instanceof ApiError ? `${(err as Error).message}` : err,
  );
  if (err instanceof ApiError) console.error(`(${err.code})`);
  process.exit(1);
}

import { DataDirError } from '../config.ts';
import { openDataStore, PendingRestoreError } from '../bootstrap.ts';
import { LibraryService } from '../services/library.ts';
import { ManuscriptService } from '../services/manuscript.ts';
import { seedSampleBooks } from '../services/sample-book.ts';

// Run through `npm run seed:dev`, which pins NOVEL_DATA_DIR to ./.data-dev.
// Codex, maps and foreshadows for the sample book arrive with later milestones.
try {
  const store = openDataStore({ refuseIfRestorePending: true });
  const library = new LibraryService(store.db, store.paths);
  const { created } = seedSampleBooks(store.db, library, new ManuscriptService(store.db, library));
  console.log(
    created
      ? `Seeded the sample books into ${store.paths.dataDir}`
      : `Sample books already exist in ${store.paths.dataDir}; nothing changed.`,
  );
  store.close();
} catch (err) {
  console.error(
    err instanceof DataDirError || err instanceof PendingRestoreError ? err.message : err,
  );
  process.exit(1);
}

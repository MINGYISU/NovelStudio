import { DataDirError } from '../config.ts';
import { openDataStore } from '../bootstrap.ts';

// Stub: the sample book (volumes, chapters, CJK text, maps, foreshadows, codex) arrives with later milestones.
try {
  const store = openDataStore();
  console.log(`seed:dev is a stub in M0. Dev data directory is ready at ${store.paths.dataDir}`);
  store.close();
} catch (err) {
  console.error(err instanceof DataDirError ? err.message : err);
  process.exit(1);
}

import { fileURLToPath } from 'node:url';
import { buildApp, LISTEN_HOST } from './app.ts';
import { openDataStore } from './bootstrap.ts';
import { DataDirError } from './config.ts';
import { ColdBackupService } from './services/cold-backup.ts';

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

async function main(): Promise<void> {
  const production = process.env.NODE_ENV === 'production';
  const port = parsePort(process.env.PORT, 4317);

  const store = openDataStore({
    log: (msg, err) => console.error(msg, err),
  });
  console.log(`Data directory: ${store.paths.dataDir}`);

  const clientDir = fileURLToPath(new URL('../client', import.meta.url));
  const app = await buildApp({
    port,
    production,
    db: store.db,
    paths: store.paths,
    clientDir: production ? clientDir : undefined,
    extraOriginPorts: production ? [] : [parsePort(process.env.DEV_CLIENT_PORT, 5173)],
    logger: true,
    onWrite: () => store.hotBackup.markDirty(),
  });

  store.hotBackup.start();

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
    } finally {
      store.close();
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: LISTEN_HOST, port });
  } catch (err) {
    store.close();
    throw err;
  }

  try {
    const outcome = new ColdBackupService({ db: store.db, paths: store.paths }).runAutoDaily();
    if (outcome) app.log.info(`Automatic cold backup: ${outcome.message}`);
  } catch (err) {
    app.log.error(err, 'Automatic cold backup failed');
  }
}

main().catch((err: unknown) => {
  if (err instanceof DataDirError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { parseOrThrow } from '../errors.ts';
import {
  cancelHotRestore,
  hotBackupState,
  requestHotRestore,
} from '../services/hot-backup-restore.ts';

const nameParams = z.object({ name: z.string().max(100) });

/** HOT-02: list hot backups and stage a restore that is applied at the next server start. */
export function registerHotBackupRoutes(app: FastifyInstance, db: Db, paths: DataPaths): void {
  app.get('/api/hot-backups', async () => hotBackupState(paths));

  app.post('/api/hot-backups/:name/restore', async (request) => {
    const { name } = parseOrThrow(nameParams, request.params);
    return { pending: requestHotRestore(db, paths, name) };
  });

  app.delete('/api/hot-backups/pending-restore', async () => {
    cancelHotRestore(paths);
    return hotBackupState(paths);
  });
}

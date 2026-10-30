import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  exportBodySchema,
  putColdBackupSettingsBodySchema,
  validateLocationBodySchema,
  verifyBodySchema,
} from '../../shared/schemas/cold-backup-settings.ts';
import { localeBodySchema } from '../../shared/schemas/locale.ts';
import { ApiError, parseOrThrow } from '../errors.ts';
import type { ColdBackupService } from '../services/cold-backup.ts';
import { restoreColdBackup } from '../services/cold-backup-restore.ts';
import type { FolderPicker } from '../services/folder-picker.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';

const idParams = z.object({ id: z.uuid() });
export const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;

export function registerColdBackupRoutes(
  app: FastifyInstance,
  deps: { db: Db; paths: DataPaths; service: ColdBackupService; pickFolder: FolderPicker },
): void {
  const { db, paths, service, pickFolder } = deps;

  app.get('/api/settings/cold-backup', async () => service.settings());

  app.put('/api/settings/cold-backup', async (request) =>
    service.updateSettings(parseOrThrow(putColdBackupSettingsBodySchema, request.body)),
  );

  app.post('/api/settings/cold-backup/validate', async (request) =>
    service.validate(parseOrThrow(validateLocationBodySchema, request.body).dir),
  );

  app.post('/api/settings/cold-backup/choose-folder', async () => ({ path: await pickFolder() }));

  app.post('/api/books/:id/cold-backup', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const body = parseOrThrow(exportBodySchema, request.body ?? {});
    return { result: service.exportBook(id, body) };
  });

  app.post('/api/cold-backup/all', async (request) =>
    service.exportAll(parseOrThrow(exportBodySchema, request.body ?? {})),
  );

  app.post('/api/cold-backup/verify', async (request) => {
    const { bookId } = parseOrThrow(verifyBodySchema, request.body ?? {});
    return { results: service.verifyLast(bookId) };
  });

  // Encapsulated so the large-file multipart parser applies to the import only.
  void app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 2, fields: 4 },
    });

    scope.post('/api/import/cold-backup', async (request, reply) => {
      if (!request.isMultipart()) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Expected a multipart file upload.');
      }
      let file: Buffer | null = null;
      let sidecar: string | null = null;
      let ignoreChecksum = false;
      let localeField: string | undefined;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            const data = await part.toBuffer();
            if (part.file.truncated)
              throw new ApiError(413, 'FILE_TOO_LARGE', 'The backup file is too large.');
            if (part.fieldname === 'checksum') sidecar = data.toString('utf8');
            else if (part.fieldname === 'file') file = data;
          } else if (part.fieldname === 'ignoreChecksum') {
            ignoreChecksum = part.value === '1';
          } else if (part.fieldname === 'locale') {
            localeField = typeof part.value === 'string' ? part.value : undefined;
          }
        }
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new ApiError(413, 'FILE_TOO_LARGE', 'The backup file is too large.');
        }
        throw err;
      }
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'No backup file was uploaded.');
      const expected = sidecar ? (/^([0-9a-f]{64})\b/i.exec(sidecar.trim())?.[1] ?? null) : null;
      if (sidecar && !expected) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'The checksum file is not in shasum format.');
      }
      const result = restoreColdBackup(db, paths, file, {
        expectedSha256: expected,
        ignoreChecksum,
        locale: parseOrThrow(localeBodySchema, { locale: localeField }).locale,
      });
      return reply.code(201).send(result);
    });
  });
}

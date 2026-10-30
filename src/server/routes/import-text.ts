import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import {
  importTextFieldsSchema,
  MAX_TEXT_IMPORT_BYTES,
  MAX_TEXT_IMPORT_LABEL,
} from '../../shared/schemas/import.ts';
import type { Db } from '../db/connection.ts';
import { ApiError, parseOrThrow } from '../errors.ts';
import { commitTextImport, previewTextImport } from '../services/import-text.ts';

const tooLarge = () =>
  new ApiError(
    413,
    'FILE_TOO_LARGE',
    `This file is larger than ${MAX_TEXT_IMPORT_LABEL}, so it was not imported and nothing was changed. Split it into smaller files.`,
  );

export function registerImportTextRoutes(app: FastifyInstance, db: Db): void {
  // Encapsulated so this multipart parser (with its own size limit) applies to this route only.
  void app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { fileSize: MAX_TEXT_IMPORT_BYTES, files: 1, fields: 8 },
    });

    scope.post('/api/import/text', async (request, reply) => {
      if (!request.isMultipart()) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Expected a multipart file upload.');
      }
      let file: { bytes: Buffer; name: string } | null = null;
      const fields: Record<string, string> = {};
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            const bytes = await part.toBuffer();
            if (part.file.truncated) throw tooLarge();
            if (part.fieldname === 'file') file = { bytes, name: part.filename };
          } else if (typeof part.value === 'string') {
            fields[part.fieldname] = part.value;
          }
        }
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge();
        throw err;
      }
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'No file was uploaded.');

      const parsed = parseOrThrow(importTextFieldsSchema, fields);
      const input = {
        bytes: file.bytes,
        fileName: file.name,
        detect: parsed.detect === '1',
        title: parsed.title,
        preset: parsed.preset,
        locale: parsed.locale,
      };
      if (parsed.mode === 'preview') return previewTextImport(input);
      return reply.code(201).send(commitTextImport(db, input));
    });
  });
}

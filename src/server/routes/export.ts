import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseOrThrow } from '../errors.ts';
import type { Db } from '../db/connection.ts';
import { exportManuscript } from '../services/export-manuscript.ts';
import type { LibraryService } from '../services/library.ts';

const idParams = z.object({ id: z.uuid() });
const exportQuery = z.object({ format: z.enum(['md', 'txt']) });

/** Header values must be latin1; the real name goes in RFC 5987 form. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function registerExportRoutes(app: FastifyInstance, db: Db, library: LibraryService): void {
  app.get('/api/books/:id/export', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const { format } = parseOrThrow(exportQuery, request.query);
    const download = exportManuscript(db, library, id, format);
    return reply
      .header('Content-Type', download.contentType)
      .header('Content-Disposition', contentDisposition(download.fileName))
      .header('X-Content-Type-Options', 'nosniff')
      .send(download.body);
  });
}

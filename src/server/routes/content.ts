import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizeContent } from '../../shared/content-normalize.ts';
import { saveContentBodySchema } from '../../shared/schemas/node.ts';
import { parseOrThrow } from '../errors.ts';
import type { ContentService } from '../services/content.ts';
import type { SnapshotService } from '../services/snapshots.ts';

const idParams = z.object({ id: z.uuid() });

export function registerContentRoutes(
  app: FastifyInstance,
  content: ContentService,
  snapshots: SnapshotService,
): void {
  app.get('/api/nodes/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { node: content.get(id) };
  });

  app.put('/api/nodes/:id/content', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    // Normalized before validation, so a client that still sends nested quotes cannot make a
    // section unsaveable (ED-02).
    const body: unknown = request.body;
    const normalized =
      typeof body === 'object' && body !== null && 'content' in body
        ? { ...body, content: normalizeContent(body.content) }
        : body;
    return content.save(id, parseOrThrow(saveContentBodySchema, normalized));
  });

  app.get('/api/nodes/:id/snapshots', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { snapshots: snapshots.list(id) };
  });

  app.get('/api/snapshots/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { snapshot: snapshots.get(id) };
  });

  app.post('/api/snapshots/:id/restore', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { node: snapshots.restore(id) };
  });
}

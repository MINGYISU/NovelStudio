import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createNodeBodySchema,
  moveNodeBodySchema,
  patchNodeBodySchema,
} from '../../shared/schemas/node.ts';
import { localeBodySchema } from '../../shared/schemas/locale.ts';
import { parseOrThrow } from '../errors.ts';
import type { ManuscriptService } from '../services/manuscript.ts';

const idParams = z.object({ id: z.uuid() });

export function registerNodeRoutes(app: FastifyInstance, manuscript: ManuscriptService): void {
  app.get('/api/books/:id/tree', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { nodes: manuscript.tree(id) };
  });

  app.post('/api/books/:id/nodes', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const body = parseOrThrow(createNodeBodySchema, request.body);
    return reply.code(201).send(manuscript.create(id, body));
  });

  app.patch('/api/nodes/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { node: manuscript.update(id, parseOrThrow(patchNodeBodySchema, request.body)) };
  });

  app.post('/api/nodes/:id/move', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { nodes: manuscript.move(id, parseOrThrow(moveNodeBodySchema, request.body)) };
  });

  app.post('/api/nodes/:id/duplicate', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const { locale } = parseOrThrow(localeBodySchema, request.body ?? {});
    return reply.code(201).send(manuscript.duplicate(id, locale));
  });

  // Moves the section (with its subtree) to the trash; the subtree root carries `deletedAt`.
  app.delete('/api/nodes/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { nodes: manuscript.trash(id) };
  });

  app.post('/api/nodes/:id/restore', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return { nodes: manuscript.restore(id) };
  });
}

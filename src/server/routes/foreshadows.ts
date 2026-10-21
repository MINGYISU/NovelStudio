import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createOccurrenceBodySchema,
  createThreadBodySchema,
  patchOccurrenceBodySchema,
  patchThreadBodySchema,
} from '../../shared/schemas/foreshadow.ts';
import { parseOrThrow } from '../errors.ts';
import type { ForeshadowService } from '../services/foreshadows.ts';

const idParams = z.object({ id: z.uuid() });

export function registerForeshadowRoutes(
  app: FastifyInstance,
  foreshadows: ForeshadowService,
): void {
  app.get('/api/books/:id/foreshadows', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return foreshadows.list(id);
  });

  app.post('/api/books/:id/foreshadows', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    return reply
      .code(201)
      .send(foreshadows.create(id, parseOrThrow(createThreadBodySchema, request.body)));
  });

  app.patch('/api/foreshadows/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return foreshadows.update(id, parseOrThrow(patchThreadBodySchema, request.body));
  });

  app.delete('/api/foreshadows/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return foreshadows.delete(id);
  });

  app.post('/api/foreshadows/:id/occurrences', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    return reply
      .code(201)
      .send(foreshadows.addOccurrence(id, parseOrThrow(createOccurrenceBodySchema, request.body)));
  });

  app.patch('/api/occurrences/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return foreshadows.updateOccurrence(id, parseOrThrow(patchOccurrenceBodySchema, request.body));
  });

  app.delete('/api/occurrences/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return foreshadows.deleteOccurrence(id);
  });
}

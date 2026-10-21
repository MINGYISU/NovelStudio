import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { replaceBodySchema, searchBodySchema } from '../../shared/schemas/search.ts';
import { parseOrThrow } from '../errors.ts';
import type { SearchReplaceService } from '../services/search-replace.ts';

const idParams = z.object({ id: z.uuid() });

export function registerSearchRoutes(app: FastifyInstance, service: SearchReplaceService): void {
  app.post('/api/books/:id/search', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return service.search(id, parseOrThrow(searchBodySchema, request.body));
  });

  app.post('/api/books/:id/replace', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return service.replace(id, parseOrThrow(replaceBodySchema, request.body));
  });
}

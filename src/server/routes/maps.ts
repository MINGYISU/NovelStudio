import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createMapBodySchema,
  patchMapBodySchema,
  putMapDataBodySchema,
} from '../../shared/schemas/map.ts';
import { parseOrThrow } from '../errors.ts';
import type { MapService } from '../services/maps.ts';

const idParams = z.object({ id: z.uuid() });

export function registerMapRoutes(app: FastifyInstance, maps: MapService): void {
  app.get('/api/books/:id/maps', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return maps.list(id);
  });

  app.post('/api/books/:id/maps', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    return reply.code(201).send(maps.create(id, parseOrThrow(createMapBodySchema, request.body)));
  });

  app.patch('/api/maps/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return maps.rename(id, parseOrThrow(patchMapBodySchema, request.body));
  });

  app.put('/api/maps/:id/data', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return maps.saveData(id, parseOrThrow(putMapDataBodySchema, request.body).data);
  });

  app.post('/api/maps/:id/duplicate', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    return reply.code(201).send(maps.duplicate(id));
  });

  app.delete('/api/maps/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return maps.delete(id);
  });
}

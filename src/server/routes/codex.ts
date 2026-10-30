import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCategoryBodySchema,
  createEntryBodySchema,
  moveBodySchema,
  patchCategoryBodySchema,
  patchEntryBodySchema,
} from '../../shared/schemas/codex.ts';
import { localeBodySchema } from '../../shared/schemas/locale.ts';
import { parseOrThrow } from '../errors.ts';
import type { CodexService } from '../services/codex.ts';

const idParams = z.object({ id: z.uuid() });

export function registerCodexRoutes(app: FastifyInstance, codex: CodexService): void {
  app.get('/api/books/:id/codex', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.get(id);
  });

  // Idempotent: only a book without categories gets the defaults.
  app.post('/api/books/:id/codex/seed', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const { locale } = parseOrThrow(localeBodySchema, request.body ?? {});
    return { categories: codex.seedDefaults(id, locale) };
  });

  app.post('/api/books/:id/codex/categories', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const body = parseOrThrow(createCategoryBodySchema, request.body);
    return reply.code(201).send(codex.createCategory(id, body));
  });

  app.patch('/api/codex/categories/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.updateCategory(id, parseOrThrow(patchCategoryBodySchema, request.body));
  });

  app.post('/api/codex/categories/:id/move', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.moveCategory(id, parseOrThrow(moveBodySchema, request.body).index);
  });

  app.delete('/api/codex/categories/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.deleteCategory(id);
  });

  app.post('/api/books/:id/codex/entries', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const body = parseOrThrow(createEntryBodySchema, request.body);
    return reply.code(201).send(codex.createEntry(id, body));
  });

  app.patch('/api/codex/entries/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.updateEntry(id, parseOrThrow(patchEntryBodySchema, request.body));
  });

  app.post('/api/codex/entries/:id/move', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.moveEntry(id, parseOrThrow(moveBodySchema, request.body).index);
  });

  app.delete('/api/codex/entries/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return codex.deleteEntry(id);
  });
}

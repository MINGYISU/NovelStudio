import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createBookBodySchema,
  deleteBookQuerySchema,
  listBooksQuerySchema,
  patchBookBodySchema,
} from '../../shared/schemas/book.ts';
import type { Db } from '../db/connection.ts';
import { parseOrThrow } from '../errors.ts';
import { listBooks } from '../repos/books.ts';
import type { LibraryService } from '../services/library.ts';

const idParams = z.object({ id: z.uuid() });

export function registerBookRoutes(app: FastifyInstance, db: Db, library: LibraryService): void {
  app.get('/api/books', async (request) => {
    const query = parseOrThrow(listBooksQuerySchema, request.query);
    return { books: listBooks(db, query) };
  });

  app.post('/api/books', async (request, reply) => {
    const body = parseOrThrow(createBookBodySchema, request.body);
    return reply.code(201).send(library.create(body));
  });

  app.get('/api/books/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return library.requireBook(id);
  });

  app.patch('/api/books/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return library.update(id, parseOrThrow(patchBookBodySchema, request.body));
  });

  // Plain DELETE moves the book to the trash; ?purge=1&confirmTitle=… deletes it for good.
  app.delete('/api/books/:id', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const query = parseOrThrow(deleteBookQuerySchema, request.query);
    if (query.purge === '1') {
      library.purge(id, query.confirmTitle);
      return reply.code(204).send();
    }
    return library.trash(id);
  });

  app.post('/api/books/:id/restore', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return library.restore(id);
  });
}

import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { DataPaths } from './config.ts';
import type { Db } from './db/connection.ts';
import { ApiError } from './errors.ts';
import { getSchemaVersion } from './db/migrate.ts';
import { registerAssetRoutes } from './routes/assets.ts';
import { registerBookRoutes } from './routes/books.ts';
import { registerSecurity } from './security.ts';
import { LibraryService } from './services/library.ts';

export const JSON_BODY_LIMIT = 25 * 1024 * 1024;
export const LISTEN_HOST = '127.0.0.1';

export interface AppOptions {
  port: number;
  production: boolean;
  db?: Db;
  /** Data directory layout; library routes are registered only when both db and paths are given. */
  paths?: DataPaths;
  /** Directory with the built client; served only when it exists. */
  clientDir?: string;
  extraOriginPorts?: number[];
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: JSON_BODY_LIMIT });

  registerSecurity(app, {
    port: options.port,
    extraOriginPorts: options.production ? [] : options.extraOriginPorts,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 500;
    const status = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    if (status >= 500) app.log.error(error);
    reply.code(status).send({
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: status >= 500 ? 'Internal server error.' : String((error as Error).message),
      },
    });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    mode: options.production ? 'production' : 'development',
    schemaVersion: options.db ? getSchemaVersion(options.db) : null,
  }));

  if (options.db && options.paths) {
    const library = new LibraryService(options.db, options.paths);
    registerBookRoutes(app, options.db, library);
    registerAssetRoutes(app, options.db, options.paths, library);
  }

  const indexFile = options.clientDir ? path.join(options.clientDir, 'index.html') : null;
  if (options.clientDir && indexFile && fs.existsSync(indexFile)) {
    await app.register(fastifyStatic, { root: options.clientDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
    });
  } else {
    app.setNotFoundHandler((_request, reply) =>
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } }),
    );
  }

  return app;
}

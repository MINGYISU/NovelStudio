import type { FastifyInstance } from 'fastify';

export interface SecurityOptions {
  /** Port this server listens on; Host must match it. */
  port: number;
  /** Extra browser origin ports (the Vite dev server). Never set in production. */
  extraOriginPorts?: number[];
}

const HOST_NAMES = ['127.0.0.1', 'localhost'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedHosts(port: number): Set<string> {
  return new Set(HOST_NAMES.map((h) => `${h}:${port}`));
}

export function allowedOrigins(ports: number[]): Set<string> {
  return new Set(ports.flatMap((p) => HOST_NAMES.map((h) => `http://${h}:${p}`)));
}

export function registerSecurity(app: FastifyInstance, options: SecurityOptions): void {
  const hosts = allowedHosts(options.port);
  const origins = allowedOrigins([options.port, ...(options.extraOriginPorts ?? [])]);

  // DNS-rebinding protection: only our own Host names are served.
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host?.toLowerCase();
    if (!host || !hosts.has(host)) {
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN_HOST', message: 'Host header not allowed.' } });
    }

    // CSRF protection for state-changing requests; a missing Origin (CLI, tests) is allowed.
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin !== undefined && !origins.has(origin.toLowerCase())) {
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed.' } });
      }
    }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    // Routes that serve untrusted content (book images) set a stricter policy themselves.
    if (!reply.hasHeader('Content-Security-Policy')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      );
    }
  });
}

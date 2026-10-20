import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LISTEN_HOST, buildApp } from './app.ts';

const PORT = 4317;
let tmp: string;
let app: FastifyInstance;

async function build(options: { production?: boolean; withClient?: boolean } = {}) {
  let clientDir: string | undefined;
  if (options.withClient) {
    clientDir = path.join(tmp, 'client');
    fs.mkdirSync(clientDir);
    fs.writeFileSync(
      path.join(clientDir, 'index.html'),
      '<!doctype html><title>NovelStudio</title>',
    );
    fs.writeFileSync(path.join(clientDir, 'app.js'), 'console.log(1)');
  }
  app = await buildApp({
    port: PORT,
    production: options.production ?? false,
    clientDir,
    extraOriginPorts: [5173],
  });
  return app;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
});

afterEach(async () => {
  await app?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Host check', () => {
  it('rejects evil.com', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'evil.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'FORBIDDEN_HOST', message: 'Host header not allowed.' },
    });
  });

  it.each([
    'evil.com:4317',
    '127.0.0.1:9999',
    'localhost',
    '127.0.0.1.evil.com:4317',
    '[::1]:4317',
  ])('rejects Host %s', async (host) => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
    expect(res.statusCode).toBe(403);
  });

  it.each(['127.0.0.1:4317', 'localhost:4317', 'LOCALHOST:4317'])(
    'accepts Host %s',
    async (host) => {
      await build();
      const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
      expect(res.statusCode).toBe(200);
    },
  );

  it('also protects static files and unknown routes', async () => {
    await build({ withClient: true });
    for (const url of ['/', '/app.js', '/api/nope']) {
      const res = await app.inject({ method: 'GET', url, headers: { host: 'evil.com' } });
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('Origin check', () => {
  const headers = (origin?: string) => ({
    host: `127.0.0.1:${PORT}`,
    ...(origin ? { origin } : {}),
  });

  it('rejects a state-changing request from a foreign origin', async () => {
    await build();
    for (const origin of [
      'http://evil.com',
      'https://127.0.0.1:4317',
      'http://127.0.0.1:4318',
      'null',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/anything',
        headers: headers(origin),
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN_ORIGIN');
    }
  });

  it('allows the app origin and a missing origin (CLI/tests)', async () => {
    await build();
    for (const origin of ['http://127.0.0.1:4317', 'http://localhost:4317', undefined]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/anything',
        headers: headers(origin),
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('allows the Vite dev origin only outside production', async () => {
    await build({ production: false });
    const dev = await app.inject({
      method: 'POST',
      url: '/api/anything',
      headers: headers('http://127.0.0.1:5173'),
      payload: {},
    });
    expect(dev.statusCode).toBe(404);
    await app.close();

    await build({ production: true });
    const prod = await app.inject({
      method: 'POST',
      url: '/api/anything',
      headers: headers('http://127.0.0.1:5173'),
      payload: {},
    });
    expect(prod.statusCode).toBe(403);
  });

  it('does not require an origin for GET', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: headers('http://evil.com'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('health and static serving', () => {
  it('reports status and mode', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: `localhost:${PORT}` },
    });
    expect(res.json()).toEqual({ status: 'ok', mode: 'development', schemaVersion: null });
  });

  it('sends security headers', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: `localhost:${PORT}` },
    });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('serves the built client and falls back to index.html for app routes', async () => {
    await build({ production: true, withClient: true });
    const host = { host: `127.0.0.1:${PORT}` };
    const root = await app.inject({ method: 'GET', url: '/', headers: host });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('NovelStudio');
    const asset = await app.inject({ method: 'GET', url: '/app.js', headers: host });
    expect(asset.statusCode).toBe(200);
    const route = await app.inject({ method: 'GET', url: '/book/abc/manuscript', headers: host });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('NovelStudio');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    await build({ production: true, withClient: true });
    const res = await app.inject({
      method: 'GET',
      url: '/api/nope',
      headers: { host: `127.0.0.1:${PORT}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('listening', () => {
  it('binds to 127.0.0.1 only', async () => {
    expect(LISTEN_HOST).toBe('127.0.0.1');
    await build();
    await app.listen({ host: LISTEN_HOST, port: 0 });
    const address = app.server.address();
    expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
  });
});

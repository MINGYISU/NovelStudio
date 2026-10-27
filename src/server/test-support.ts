import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Book } from '../shared/schemas/book.ts';
import type { ContentDoc } from '../shared/schemas/content.ts';
import type { NodeKind, TreeNode } from '../shared/types.ts';
import { buildApp, type AppOptions } from './app.ts';
import { openDataStore, type DataStore } from './bootstrap.ts';

export const TEST_PORT = 4317;
export const HOST = { host: `127.0.0.1:${TEST_PORT}` };

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A throwaway data directory plus a running app on it. Tests only; never touches real data. */
export class Harness {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-'));
  dataDir = path.join(this.tmp, 'data');
  store!: DataStore;
  app!: FastifyInstance;

  constructor(private readonly options: Partial<AppOptions> = {}) {
    fs.mkdirSync(path.join(this.tmp, 'home'));
  }

  get home(): string {
    return path.join(this.tmp, 'home');
  }

  async start(): Promise<this> {
    // The harness plays the server, which is the only place a pending hot restore is applied.
    this.store = openDataStore({
      applyPendingRestore: true,
      env: { NODE_ENV: 'test', NOVEL_DATA_DIR: this.dataDir },
      homedir: this.home,
    });
    this.app = await buildApp({
      port: TEST_PORT,
      production: false,
      db: this.store.db,
      paths: this.store.paths,
      homedir: this.home,
      ...this.options,
    });
    return this;
  }

  async stop(): Promise<void> {
    await this.app.close();
    this.store.close();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async cleanup(): Promise<void> {
    await this.stop();
    fs.rmSync(this.tmp, { recursive: true, force: true });
  }

  api(method: Method, url: string, payload?: unknown) {
    return this.app.inject({ method, url, headers: HOST, payload: payload as object | undefined });
  }

  async createBook(title = 'Test Book'): Promise<Book> {
    const res = await this.api('POST', '/api/books', { title });
    if (res.statusCode !== 201) throw new Error(`createBook failed: ${res.body}`);
    return res.json<Book>();
  }

  async createNode(
    bookId: string,
    kind: NodeKind,
    parentId: string | null,
    title = '',
    extra: object = {},
  ): Promise<TreeNode> {
    const res = await this.api('POST', `/api/books/${bookId}/nodes`, {
      kind,
      parentId,
      title,
      ...extra,
    });
    if (res.statusCode !== 201) throw new Error(`createNode failed: ${res.body}`);
    return res.json<{ node: TreeNode }>().node;
  }

  /** Saves a document and returns the new revision. */
  async saveContent(nodeId: string, content: ContentDoc, rev: number) {
    return this.api('PUT', `/api/nodes/${nodeId}/content`, { content, rev });
  }
}

export const paragraphs = (...texts: string[]): ContentDoc => ({
  type: 'doc',
  content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

/** A valid 1x1 PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Builds a multipart/form-data body for `app.inject`. */
export function multipartBody(
  parts: { name: string; filename?: string; data: Buffer | string }[],
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----test${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename ? `; filename="${part.filename}"` : '');
    const type = part.filename ? '\r\nContent-Type: application/octet-stream' : '';
    chunks.push(
      Buffer.from(`--${boundary}\r\n${disposition}${type}\r\n\r\n`),
      Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { ...HOST, 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

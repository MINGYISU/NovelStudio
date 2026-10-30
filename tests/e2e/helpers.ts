import zlib from 'node:zlib';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

interface ApiNode {
  id: string;
  parentId: string | null;
  kind: 'volume' | 'part' | 'chapter' | 'scene';
  title: string;
  position: number;
  deletedAt: string | null;
}

export interface SeededBook {
  id: string;
  nodes: Record<string, ApiNode>;
}

async function json<T>(res: {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}): Promise<T> {
  expect(res.ok(), `API request failed with ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

/** Creates a book through the API; `build` receives helpers to add sections (made-up titles only). */
export async function seedBook(
  request: APIRequestContext,
  title: string,
  build: (
    add: (
      key: string,
      kind: ApiNode['kind'],
      parent: string | null,
      title: string,
    ) => Promise<void>,
  ) => Promise<void>,
): Promise<SeededBook> {
  const book = await json<{ id: string }>(await request.post('/api/books', { data: { title } }));
  const nodes: Record<string, ApiNode> = {};
  await build(async (key, kind, parent, nodeTitle) => {
    const parentId = parent ? (nodes[parent]?.id ?? null) : null;
    const { node } = await json<{ node: ApiNode }>(
      await request.post(`/api/books/${book.id}/nodes`, {
        data: { kind, parentId, title: nodeTitle },
      }),
    );
    nodes[key] = node;
  });
  return { id: book.id, nodes };
}

/** The book's live sections as "parentTitle > title" paths in reading order, straight from the server. */
export async function serverOrder(request: APIRequestContext, bookId: string): Promise<string[]> {
  const { nodes } = await json<{ nodes: ApiNode[] }>(
    await request.get(`/api/books/${bookId}/tree`),
  );
  const live = nodes.filter((n) => n.deletedAt === null);
  const walk = (parentId: string | null, prefix: string): string[] =>
    live
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.position - b.position)
      .flatMap((n) => [`${prefix}${n.title}`, ...walk(n.id, `${prefix}${n.title} > `)]);
  return walk(null, '');
}

export function rows(page: Page): Locator {
  return page.getByTestId('tree-row');
}

export function row(page: Page, label: string): Locator {
  return rows(page).filter({ hasText: label }).first();
}

/** Display titles of the visible rows, top to bottom. */
export async function visibleTitles(page: Page): Promise<string[]> {
  return page.locator('[data-testid="tree-row"] [data-kind]').allTextContents();
}

export async function openBook(page: Page, bookId: string): Promise<void> {
  await page.goto(`/book/${bookId}/manuscript`);
  await expect(rows(page).first()).toBeVisible();
}

export function editorOf(page: Page): Locator {
  return page.getByTestId('editor');
}

/** Opens a section directly by URL and waits for its editor. */
export async function openSection(page: Page, bookId: string, nodeId: string): Promise<Locator> {
  await page.goto(`/book/${bookId}/manuscript/${nodeId}`);
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  return editor;
}

export async function savedText(request: APIRequestContext, nodeId: string): Promise<string> {
  const res = await request.get(`/api/nodes/${nodeId}`);
  expect(res.ok()).toBe(true);
  const { node } = (await res.json()) as { node: { content: unknown } };
  const texts: string[] = [];
  const walk = (n: { text?: string; content?: unknown[] }): void => {
    if (n.text) texts.push(n.text);
    (n.content as { text?: string; content?: unknown[] }[] | undefined)?.forEach(walk);
  };
  walk(node.content as { content?: unknown[] });
  return texts.join('');
}

/** Puts text into a section through the API (made-up text only). */
export async function seedText(
  request: APIRequestContext,
  nodeId: string,
  text: string,
): Promise<void> {
  const res = await request.put(`/api/nodes/${nodeId}/content`, {
    data: {
      rev: 0,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    },
  });
  expect(res.ok(), `seedText failed with ${res.status()}`).toBe(true);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** A made-up solid-color PNG, so no real pictures are ever needed as fixtures. */
export function makePng(
  width: number,
  height: number,
  rgb: [number, number, number],
  noise = false,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  // `noise` paints a shifting gradient: smooth for a lossy encoder, but a poor fit for lossless
  // PNG, so a large image really is bigger than its WebP version.
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const shift = noise ? Math.floor((x * 255) / width + y * 7) % 256 : 0;
      row.set(
        rgb.map((c) => (c + shift) % 256),
        1 + x * 3,
      );
    }
    return row;
  });
  const raw = Buffer.concat(rows);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Uploads an image to the book through the API and returns its asset id. */
export async function uploadImage(
  request: APIRequestContext,
  bookId: string,
  png: Buffer,
  name = 'made-up.png',
): Promise<string> {
  const { id } = await json<{ id: string }>(
    await request.post(`/api/books/${bookId}/assets`, {
      multipart: { file: { name, mimeType: 'image/png', buffer: png } },
    }),
  );
  return id;
}

/** Stores a section's text through the API: paragraphs and images (`{ image: assetId }`). */
export async function seedBlocks(
  request: APIRequestContext,
  nodeId: string,
  blocks: (string | { image: string; caption?: string })[],
): Promise<void> {
  const content = {
    type: 'doc',
    content: blocks.map((block) =>
      typeof block === 'string'
        ? { type: 'paragraph', content: [{ type: 'text', text: block }] }
        : {
            type: 'image',
            attrs: { assetId: block.image, size: 'medium', caption: block.caption ?? '' },
          },
    ),
  };
  const res = await request.put(`/api/nodes/${nodeId}/content`, { data: { rev: 0, content } });
  expect(res.ok(), `seedBlocks failed with ${res.status()}`).toBe(true);
}

/** The stored content of a section, straight from the server. */
export async function savedContent(
  request: APIRequestContext,
  nodeId: string,
): Promise<{ type: string; attrs?: Record<string, unknown> }[]> {
  const { node } = await json<{ node: { content: { content?: never[] } } }>(
    await request.get(`/api/nodes/${nodeId}`),
  );
  return node.content.content ?? [];
}

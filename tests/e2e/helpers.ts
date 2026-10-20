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

import { z } from 'zod';
import type { TreeNode } from '../../../shared/types.ts';

const foldSchema = z.record(z.string(), z.boolean());
export type OpenMap = Record<string, boolean>;

const key = (bookId: string) => `novelstudio.tree.open.${bookId}`;

/** UI-only state (TREE-07): kept in localStorage per book; it never holds manuscript data. */
export function loadOpenState(bookId: string): OpenMap | null {
  try {
    const raw = localStorage.getItem(key(bookId));
    if (raw === null) return null;
    const parsed = foldSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Only ids that still exist are written, so deleted sections do not pile up. */
export function saveOpenState(bookId: string, open: OpenMap, nodes: readonly TreeNode[]): void {
  const ids = new Set(nodes.map((n) => n.id));
  const pruned: OpenMap = {};
  for (const [id, value] of Object.entries(open)) if (ids.has(id)) pruned[id] = value;
  try {
    localStorage.setItem(key(bookId), JSON.stringify(pruned));
  } catch {
    // Fold state is a convenience only; ignore storage failures.
  }
}

/** First visit: volumes and parts are open so the book structure is visible, chapters are folded. */
export function initialOpenState(bookId: string, nodes: readonly TreeNode[]): OpenMap {
  const saved = loadOpenState(bookId) ?? {};
  const state: OpenMap = {};
  for (const n of nodes) {
    state[n.id] = saved[n.id] ?? (n.kind === 'volume' || n.kind === 'part');
  }
  return state;
}

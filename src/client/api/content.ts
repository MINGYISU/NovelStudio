import { useQuery } from '@tanstack/react-query';
import type { ContentDoc } from '../../shared/schemas/content.ts';
import {
  nodeContentResponseSchema,
  saveContentResponseSchema,
  type NodeContent,
} from '../../shared/schemas/node.ts';
import {
  restoreSnapshotResponseSchema,
  snapshotDetailResponseSchema,
  snapshotListResponseSchema,
} from '../../shared/schemas/snapshot.ts';
import { errorResponseSchema } from '../../shared/schemas/book.ts';
import { SaveError, type SaveTransport } from '../features/editor/autosave.ts';
import { apiRequest } from './http.ts';

export async function fetchNodeContent(id: string, signal?: AbortSignal): Promise<NodeContent> {
  return nodeContentResponseSchema.parse(await apiRequest(`/api/nodes/${id}`, { signal })).node;
}

/** Browsers cap the body of a keepalive request at 64 KB in total. */
const KEEPALIVE_MAX_BYTES = 60_000;

export const httpSaveTransport: SaveTransport = {
  async save(nodeId, content, rev) {
    const body = JSON.stringify({ content, rev });
    let res: Response;
    try {
      res = await fetch(`/api/nodes/${nodeId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        // Small saves survive a page unload; larger ones are a normal request.
        keepalive: new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES,
      });
    } catch {
      throw new SaveError('failed', 'Cannot reach the NovelStudio server.');
    }
    const data: unknown = await res.json().catch(() => undefined);
    if (res.ok) return saveContentResponseSchema.parse(data);
    const parsed = errorResponseSchema.safeParse(data);
    const code = parsed.success ? parsed.data.error.code : 'UNKNOWN';
    const message = parsed.success ? parsed.data.error.message : `Save failed (${res.status}).`;
    if (code === 'STALE_REVISION') throw new SaveError('stale', message);
    throw new SaveError('failed', message, res.status >= 500);
  },
};

export const snapshotsKey = (nodeId: string) => ['snapshots', nodeId] as const;

export function useSnapshots(nodeId: string) {
  return useQuery({
    queryKey: snapshotsKey(nodeId),
    gcTime: 0,
    queryFn: async ({ signal }) =>
      snapshotListResponseSchema.parse(
        await apiRequest(`/api/nodes/${nodeId}/snapshots`, { signal }),
      ).snapshots,
  });
}

export function useSnapshotDetail(id: string | null) {
  return useQuery({
    queryKey: ['snapshot', id],
    enabled: id !== null,
    gcTime: 0,
    queryFn: async ({ signal }) =>
      snapshotDetailResponseSchema.parse(await apiRequest(`/api/snapshots/${id}`, { signal }))
        .snapshot,
  });
}

export async function restoreSnapshot(id: string): Promise<NodeContent> {
  return restoreSnapshotResponseSchema.parse(
    await apiRequest(`/api/snapshots/${id}/restore`, { method: 'POST' }),
  ).node;
}

export type { ContentDoc, NodeContent };

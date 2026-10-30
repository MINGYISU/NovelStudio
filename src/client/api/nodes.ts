import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  nodeAndTreeResponseSchema,
  nodeResponseSchema,
  treeResponseSchema,
  type CreateNodeBody,
  type MoveNodeBody,
  type PatchNodeBody,
} from '../../shared/schemas/node.ts';
import { applyMove } from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/types.ts';
import { currentLocale } from '../i18n/index.ts';
import { apiRequest } from './http.ts';

export const treeKey = (bookId: string) => ['tree', bookId] as const;
const writeKey = (bookId: string) => ['tree-write', bookId] as const;

export function useTree(bookId: string | undefined) {
  return useQuery({
    queryKey: treeKey(bookId ?? ''),
    enabled: bookId !== undefined,
    retry: false,
    queryFn: async ({ signal }) =>
      treeResponseSchema.parse(await apiRequest(`/api/books/${bookId}/tree`, { signal })).nodes,
  });
}

interface Snapshot {
  previous: TreeNode[] | undefined;
}

/** Applies an optimistic change to the cached tree and remembers what to roll back to. */
async function applyOptimistic(
  client: QueryClient,
  bookId: string,
  change: (nodes: TreeNode[]) => TreeNode[],
): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: treeKey(bookId) });
  const previous = client.getQueryData<TreeNode[]>(treeKey(bookId));
  if (previous) client.setQueryData(treeKey(bookId), change(previous));
  return { previous };
}

function rollback(client: QueryClient, bookId: string, snapshot: Snapshot | undefined): void {
  // With newer writes in flight the snapshot is stale; the last write to settle refetches instead.
  if (snapshot?.previous && client.isMutating({ mutationKey: writeKey(bookId) }) <= 1) {
    client.setQueryData(treeKey(bookId), snapshot.previous);
  }
}

/**
 * Server trees are applied only when no other write is in flight; otherwise an older response would
 * overwrite the newer optimistic state. The last write to settle refetches, so nothing is lost.
 */
function commit(client: QueryClient, bookId: string, nodes: TreeNode[]): void {
  if (client.isMutating({ mutationKey: writeKey(bookId) }) <= 1) {
    client.setQueryData(treeKey(bookId), nodes);
  }
}

/** After a failure (or a stale cache) the server is the source of truth: refetch once writes settle. */
function settle(client: QueryClient, bookId: string): void {
  if (client.isMutating({ mutationKey: writeKey(bookId) }) <= 1) {
    void client.invalidateQueries({ queryKey: treeKey(bookId) });
  }
}

export interface MoveVars extends MoveNodeBody {
  id: string;
}

/** Optimistic move: the cache changes immediately and reverts if the server refuses (MOVE-08). */
export function useMoveNode(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: writeKey(bookId),
    mutationFn: async ({ id, ...body }: MoveVars) =>
      treeResponseSchema.parse(
        await apiRequest(`/api/nodes/${id}/move`, { method: 'POST', json: body }),
      ).nodes,
    onMutate: ({ id, parentId, index }) =>
      applyOptimistic(client, bookId, (nodes) => applyMove(nodes, id, parentId, index).nodes),
    onSuccess: (nodes) => commit(client, bookId, nodes),
    onError: (_error, _vars, snapshot) => rollback(client, bookId, snapshot),
    onSettled: () => settle(client, bookId),
  });
}

export function useCreateNode(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: writeKey(bookId),
    mutationFn: async (body: CreateNodeBody) =>
      nodeAndTreeResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/nodes`, { method: 'POST', json: body }),
      ),
    onSuccess: ({ nodes }) => commit(client, bookId, nodes),
    onSettled: () => settle(client, bookId),
  });
}

export function useDuplicateNode(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: writeKey(bookId),
    mutationFn: async (id: string) =>
      nodeAndTreeResponseSchema.parse(
        await apiRequest(`/api/nodes/${id}/duplicate`, {
          method: 'POST',
          json: { locale: currentLocale() },
        }),
      ),
    onSuccess: ({ nodes }) => commit(client, bookId, nodes),
    onSettled: () => settle(client, bookId),
  });
}

export function useUpdateNode(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: writeKey(bookId),
    mutationFn: async ({ id, patch }: { id: string; patch: PatchNodeBody }) =>
      nodeResponseSchema.parse(
        await apiRequest(`/api/nodes/${id}`, { method: 'PATCH', json: patch }),
      ).node,
    onMutate: ({ id, patch }) =>
      applyOptimistic(client, bookId, (nodes) =>
        nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      ),
    onSuccess: (node) =>
      client.setQueryData<TreeNode[]>(treeKey(bookId), (nodes) =>
        nodes?.map((n) => (n.id === node.id ? node : n)),
      ),
    onError: (_error, _vars, snapshot) => rollback(client, bookId, snapshot),
    onSettled: () => settle(client, bookId),
  });
}

function useTreeReplacingMutation(
  bookId: string,
  path: (id: string) => string,
  verb: 'POST' | 'DELETE',
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: writeKey(bookId),
    mutationFn: async (id: string) =>
      treeResponseSchema.parse(await apiRequest(path(id), { method: verb })).nodes,
    onSuccess: (nodes) => commit(client, bookId, nodes),
    onSettled: () => settle(client, bookId),
  });
}

export function useTrashNode(bookId: string) {
  return useTreeReplacingMutation(bookId, (id) => `/api/nodes/${id}`, 'DELETE');
}

export function useRestoreNode(bookId: string) {
  return useTreeReplacingMutation(bookId, (id) => `/api/nodes/${id}/restore`, 'POST');
}

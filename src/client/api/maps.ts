import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { errorResponseSchema } from '../../shared/schemas/book.ts';
import {
  mapResponseSchema,
  mapsResponseSchema,
  type CreateMapBody,
  type MapData,
  type StoryMap,
} from '../../shared/schemas/map.ts';
import { apiErrorMessage, currentLocale } from '../i18n/index.ts';
import { ApiRequestError, apiRequest } from './http.ts';

export const mapsKey = (bookId: string) => ['maps', bookId] as const;

/**
 * The cache holds the newest local state of every map (the canvas writes into it as you edit), so
 * it is never refetched behind the canvas's back: an older server copy would hide unsaved work.
 */
export function useMaps(bookId: string | undefined) {
  return useQuery({
    queryKey: mapsKey(bookId ?? ''),
    enabled: bookId !== undefined,
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) =>
      mapsResponseSchema.parse(await apiRequest(`/api/books/${bookId}/maps`, { signal })).maps,
  });
}

function update(client: QueryClient, bookId: string, change: (maps: StoryMap[]) => StoryMap[]) {
  client.setQueryData<StoryMap[]>(mapsKey(bookId), (maps) => (maps ? change(maps) : maps));
}

/** Records the newest local data of a map, so reopening it never shows an older copy. */
export function cacheMapData(client: QueryClient, bookId: string, mapId: string, data: MapData) {
  update(client, bookId, (maps) => maps.map((m) => (m.id === mapId ? { ...m, data } : m)));
}

export function useCreateMap(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateMapBody): Promise<StoryMap> =>
      mapResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/maps`, {
          method: 'POST',
          json: { ...body, locale: currentLocale() },
        }),
      ).map,
    onSuccess: (map) => update(client, bookId, (maps) => [...maps, map]),
  });
}

export function useRenameMap(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; title: string }): Promise<StoryMap> =>
      mapResponseSchema.parse(
        await apiRequest(`/api/maps/${vars.id}`, { method: 'PATCH', json: { title: vars.title } }),
      ).map,
    onSuccess: (map) =>
      update(client, bookId, (maps) =>
        maps.map((m) => (m.id === map.id ? { ...m, title: map.title } : m)),
      ),
  });
}

export function useDuplicateMap(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<StoryMap> =>
      mapResponseSchema.parse(
        await apiRequest(`/api/maps/${id}/duplicate`, {
          method: 'POST',
          json: { locale: currentLocale() },
        }),
      ).map,
    onSuccess: (copy, id) =>
      update(client, bookId, (maps) => {
        const index = maps.findIndex((m) => m.id === id);
        const next = [...maps];
        next.splice(index + 1, 0, copy);
        return next.map((m, position) => ({ ...m, position }));
      }),
  });
}

export function useDeleteMap(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      await apiRequest(`/api/maps/${id}`, { method: 'DELETE' });
      return id;
    },
    onSuccess: (id) =>
      update(client, bookId, (maps) =>
        maps.filter((m) => m.id !== id).map((m, position) => ({ ...m, position })),
      ),
  });
}

/** Browsers cap the body of a keepalive request at 64 KB in total. */
const KEEPALIVE_MAX_BYTES = 60_000;

/** A failed save; `retryable` is false for answers that would fail the same way again. */
export class MapSaveError extends Error {
  override name = 'MapSaveError';

  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function putMapData(
  id: string,
  data: MapData,
  options: { keepalive: boolean },
): Promise<void> {
  const body = JSON.stringify({ data });
  let res: Response;
  try {
    res = await fetch(`/api/maps/${id}/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Small saves survive a page unload; larger ones are a normal request.
      keepalive: options.keepalive && new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES,
    });
  } catch {
    throw new MapSaveError(apiErrorMessage(new ApiRequestError(0, 'NETWORK', '')), true);
  }
  if (res.ok) return;
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => undefined));
  throw new MapSaveError(
    apiErrorMessage(
      new ApiRequestError(
        res.status,
        parsed.success ? parsed.data.error.code : 'UNKNOWN',
        parsed.success ? parsed.data.error.message : `Save failed (${res.status}).`,
      ),
    ),
    res.status >= 500,
  );
}

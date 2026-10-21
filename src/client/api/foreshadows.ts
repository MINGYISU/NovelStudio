import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  threadResponseSchema,
  threadsResponseSchema,
  type CreateOccurrenceBody,
  type CreateThreadBody,
  type PatchOccurrenceBody,
  type PatchThreadBody,
  type Thread,
} from '../../shared/schemas/foreshadow.ts';
import { apiRequest } from './http.ts';

export const threadsKey = (bookId: string) => ['foreshadows', bookId] as const;

export function useThreads(bookId: string | undefined) {
  return useQuery({
    queryKey: threadsKey(bookId ?? ''),
    enabled: bookId !== undefined,
    retry: false,
    queryFn: async ({ signal }) =>
      threadsResponseSchema.parse(await apiRequest(`/api/books/${bookId}/foreshadows`, { signal }))
        .threads,
  });
}

function replaceThread(client: QueryClient, bookId: string, thread: Thread): void {
  client.setQueryData<Thread[]>(threadsKey(bookId), (threads) =>
    threads?.map((t) => (t.id === thread.id ? thread : t)),
  );
}

export function useCreateThread(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateThreadBody): Promise<Thread> =>
      threadResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/foreshadows`, { method: 'POST', json: body }),
      ).thread,
    onSuccess: (thread) =>
      client.setQueryData<Thread[]>(threadsKey(bookId), (threads) =>
        threads ? [...threads, thread] : threads,
      ),
  });
}

export function useUpdateThread(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: PatchThreadBody }): Promise<Thread> =>
      threadResponseSchema.parse(
        await apiRequest(`/api/foreshadows/${vars.id}`, { method: 'PATCH', json: vars.patch }),
      ).thread,
    onSuccess: (thread) => replaceThread(client, bookId, thread),
  });
}

export function useDeleteThread(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      await apiRequest(`/api/foreshadows/${id}`, { method: 'DELETE' });
      return id;
    },
    onSuccess: (id) =>
      client.setQueryData<Thread[]>(threadsKey(bookId), (threads) =>
        threads?.filter((t) => t.id !== id),
      ),
  });
}

export function useAddOccurrence(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { threadId: string; body: CreateOccurrenceBody }): Promise<Thread> =>
      threadResponseSchema.parse(
        await apiRequest(`/api/foreshadows/${vars.threadId}/occurrences`, {
          method: 'POST',
          json: vars.body,
        }),
      ).thread,
    onSuccess: (thread) => replaceThread(client, bookId, thread),
  });
}

export function useUpdateOccurrence(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: PatchOccurrenceBody }): Promise<Thread> =>
      threadResponseSchema.parse(
        await apiRequest(`/api/occurrences/${vars.id}`, { method: 'PATCH', json: vars.patch }),
      ).thread,
    onSuccess: (thread) => replaceThread(client, bookId, thread),
  });
}

export function useDeleteOccurrence(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Thread> =>
      threadResponseSchema.parse(await apiRequest(`/api/occurrences/${id}`, { method: 'DELETE' }))
        .thread,
    onSuccess: (thread) => replaceThread(client, bookId, thread),
  });
}

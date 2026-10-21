import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  replaceResponseSchema,
  searchResponseSchema,
  type ReplaceBody,
  type SearchBody,
} from '../../shared/schemas/search.ts';
import { apiRequest } from './http.ts';
import { treeKey } from './nodes.ts';
import { threadsKey } from './foreshadows.ts';

export async function searchBook(bookId: string, body: SearchBody) {
  return searchResponseSchema.parse(
    await apiRequest(`/api/books/${bookId}/search`, { method: 'POST', json: body }),
  );
}

export function useReplaceInBook(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReplaceBody) =>
      replaceResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/replace`, { method: 'POST', json: body }),
      ),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: treeKey(bookId) });
      void client.invalidateQueries({ queryKey: threadsKey(bookId) });
      void client.invalidateQueries({ queryKey: ['books'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { assetSchema, type Asset } from '../../shared/schemas/book.ts';
import {
  categoriesResponseSchema,
  categoryResponseSchema,
  codexResponseSchema,
  entriesResponseSchema,
  entryResponseSchema,
  type CodexCategory,
  type CodexData,
  type CodexEntry,
  type CreateCategoryBody,
  type CreateEntryBody,
  type PatchCategoryBody,
  type PatchEntryBody,
} from '../../shared/schemas/codex.ts';
import { apiRequest } from './http.ts';

export const codexKey = (bookId: string) => ['codex', bookId] as const;

export function useCodex(bookId: string | undefined) {
  return useQuery({
    queryKey: codexKey(bookId ?? ''),
    enabled: bookId !== undefined,
    queryFn: async ({ signal }) =>
      codexResponseSchema.parse(await apiRequest(`/api/books/${bookId}/codex`, { signal })),
  });
}

function update(client: QueryClient, bookId: string, change: (data: CodexData) => CodexData) {
  client.setQueryData<CodexData>(codexKey(bookId), (data) => (data ? change(data) : data));
}

const withCategoryEntries = (
  data: CodexData,
  categoryId: string,
  entries: CodexEntry[],
): CodexData => ({
  ...data,
  entries: [...data.entries.filter((e) => e.categoryId !== categoryId), ...entries],
});

/** Every mutation refreshes the codex afterwards, so the screen always shows what the server stored. */
function useCodexMutation<TVars, TResult>(
  bookId: string,
  fn: (vars: TVars) => Promise<TResult>,
  apply?: (client: QueryClient, result: TResult) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => apply?.(client, result),
    onSettled: () => client.invalidateQueries({ queryKey: codexKey(bookId) }),
  });
}

export function useSeedCodex(bookId: string) {
  return useCodexMutation(
    bookId,
    async () =>
      categoriesResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/codex/seed`, { method: 'POST' }),
      ).categories,
  );
}

export function useCreateCategory(bookId: string) {
  return useCodexMutation(
    bookId,
    async (body: CreateCategoryBody): Promise<CodexCategory> =>
      categoryResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/codex/categories`, { method: 'POST', json: body }),
      ).category,
  );
}

export function useUpdateCategory(bookId: string) {
  return useCodexMutation(
    bookId,
    async (vars: { id: string; patch: PatchCategoryBody }): Promise<CodexCategory> =>
      categoryResponseSchema.parse(
        await apiRequest(`/api/codex/categories/${vars.id}`, {
          method: 'PATCH',
          json: vars.patch,
        }),
      ).category,
  );
}

export function useMoveCategory(bookId: string) {
  return useCodexMutation(
    bookId,
    async (vars: { id: string; index: number }): Promise<CodexCategory[]> =>
      categoriesResponseSchema.parse(
        await apiRequest(`/api/codex/categories/${vars.id}/move`, {
          method: 'POST',
          json: { index: vars.index },
        }),
      ).categories,
    (client, categories) => update(client, bookId, (data) => ({ ...data, categories })),
  );
}

export function useDeleteCategory(bookId: string) {
  return useCodexMutation(
    bookId,
    async (id: string): Promise<CodexCategory[]> =>
      categoriesResponseSchema.parse(
        await apiRequest(`/api/codex/categories/${id}`, { method: 'DELETE' }),
      ).categories,
  );
}

export function useCreateEntry(bookId: string) {
  return useCodexMutation(
    bookId,
    async (body: CreateEntryBody): Promise<CodexEntry> =>
      entryResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/codex/entries`, { method: 'POST', json: body }),
      ).entry,
  );
}

export async function patchEntry(id: string, patch: PatchEntryBody): Promise<CodexEntry> {
  return entryResponseSchema.parse(
    await apiRequest(`/api/codex/entries/${id}`, { method: 'PATCH', json: patch }),
  ).entry;
}

/** Puts a stored entry into the cache without a full refetch. */
export function storeEntry(client: QueryClient, bookId: string, entry: CodexEntry): void {
  update(client, bookId, (data) => ({
    ...data,
    entries: data.entries.map((e) => (e.id === entry.id ? entry : e)),
  }));
}

export function useMoveEntry(bookId: string) {
  return useCodexMutation(
    bookId,
    async (vars: { id: string; categoryId: string; index: number }) => ({
      categoryId: vars.categoryId,
      entries: entriesResponseSchema.parse(
        await apiRequest(`/api/codex/entries/${vars.id}/move`, {
          method: 'POST',
          json: { index: vars.index },
        }),
      ).entries,
    }),
    (client, result) =>
      update(client, bookId, (data) =>
        withCategoryEntries(data, result.categoryId, result.entries),
      ),
  );
}

export function useDeleteEntry(bookId: string) {
  return useCodexMutation(
    bookId,
    async (id: string): Promise<CodexEntry[]> =>
      entriesResponseSchema.parse(
        await apiRequest(`/api/codex/entries/${id}`, { method: 'DELETE' }),
      ).entries,
  );
}

export async function uploadEntryImage(bookId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  return assetSchema.parse(
    await apiRequest(`/api/books/${bookId}/assets`, { method: 'POST', body: form }),
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assetSchema,
  bookListSchema,
  bookSchema,
  type Asset,
  type Book,
  type BookSort,
  type CreateBookBody,
  type PatchBookBody,
} from '../../shared/schemas/book.ts';
import { apiRequest } from './http.ts';

const booksKey = ['books'] as const;

export function useBooks(options: { sort: BookSort; trashed: boolean }) {
  return useQuery({
    queryKey: [...booksKey, 'list', options],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        sort: options.sort,
        trashed: options.trashed ? '1' : '0',
      });
      return bookListSchema.parse(await apiRequest(`/api/books?${params}`, { signal })).books;
    },
  });
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: [...booksKey, 'one', id],
    enabled: id !== undefined,
    retry: false,
    queryFn: async ({ signal }) =>
      bookSchema.parse(await apiRequest(`/api/books/${id}`, { signal })),
  });
}

function useBookMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: booksKey }),
  });
}

export function useCreateBook() {
  return useBookMutation(async (body: CreateBookBody): Promise<Book> =>
    bookSchema.parse(await apiRequest('/api/books', { method: 'POST', json: body })),
  );
}

async function uploadCover(bookId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  return assetSchema.parse(
    await apiRequest(`/api/books/${bookId}/assets`, { method: 'POST', body: form }),
  );
}

export interface UpdateBookVars {
  id: string;
  patch: Omit<PatchBookBody, 'coverAssetId'>;
  /** `undefined` keeps the cover, `null` removes it, a File replaces it. */
  cover?: File | null;
  /** `undefined` keeps the background image, `null` removes it, a File replaces it (DISP-02). */
  background?: File | null;
}

export function useUpdateBook() {
  return useBookMutation(
    async ({ id, patch, cover, background }: UpdateBookVars): Promise<Book> => {
      const body: PatchBookBody = { ...patch };
      if (cover instanceof File) body.coverAssetId = (await uploadCover(id, cover)).id;
      else if (cover === null) body.coverAssetId = null;
      if (body.display && background !== undefined) {
        const backgroundImageAssetId =
          background === null ? null : (await uploadCover(id, background)).id;
        body.display = { ...body.display, backgroundImageAssetId };
      }
      return bookSchema.parse(
        await apiRequest(`/api/books/${id}`, { method: 'PATCH', json: body }),
      );
    },
  );
}

export function useTrashBook() {
  return useBookMutation(async (id: string): Promise<Book> =>
    bookSchema.parse(await apiRequest(`/api/books/${id}`, { method: 'DELETE' })),
  );
}

export function useRestoreBook() {
  return useBookMutation(async (id: string): Promise<Book> =>
    bookSchema.parse(await apiRequest(`/api/books/${id}/restore`, { method: 'POST' })),
  );
}

export function usePurgeBook() {
  return useBookMutation(async (vars: { id: string; confirmTitle: string }): Promise<void> => {
    const params = new URLSearchParams({ purge: '1', confirmTitle: vars.confirmTitle });
    await apiRequest(`/api/books/${vars.id}?${params}`, { method: 'DELETE' });
  });
}

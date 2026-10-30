import { useQuery } from '@tanstack/react-query';
import {
  assetListResponseSchema,
  assetSchema,
  type Asset,
  type AssetListResponse,
} from '../../shared/schemas/book.ts';
import { z } from 'zod';
import { apiRequest } from './http.ts';

export const assetsKey = (bookId: string) => ['assets', bookId] as const;

/** Every image of the book, newest first, with their total size (IMG-08). */
export function useBookAssets(bookId: string) {
  return useQuery({
    queryKey: assetsKey(bookId),
    gcTime: 0,
    queryFn: async ({ signal }): Promise<AssetListResponse> =>
      assetListResponseSchema.parse(await apiRequest(`/api/books/${bookId}/assets`, { signal })),
  });
}

export async function uploadBookImage(bookId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  return assetSchema.parse(
    await apiRequest(`/api/books/${bookId}/assets`, { method: 'POST', body: form }),
  );
}

/** Copies an image of another book into this one (IMG-10). */
export async function copyBookImage(
  bookId: string,
  sourceBookId: string,
  assetId: string,
): Promise<Asset> {
  return z.object({ asset: assetSchema }).parse(
    await apiRequest(`/api/books/${bookId}/assets/copy`, {
      method: 'POST',
      json: { sourceBookId, assetId },
    }),
  ).asset;
}

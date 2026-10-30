import type { Asset } from '../../../shared/schemas/book.ts';
import { uploadBookImage } from '../../api/assets.ts';
import { getKeepOriginal, optimizeImage } from './image-optimize.ts';

/** Optimizes (unless "Keep original" is on) and uploads one image file to the book. */
export async function uploadImageFile(
  bookId: string,
  file: File,
  keepOriginal: boolean = getKeepOriginal(),
): Promise<Asset> {
  return uploadBookImage(bookId, keepOriginal ? file : await optimizeImage(file));
}

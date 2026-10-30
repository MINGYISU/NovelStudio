import { needsOptimizing, targetSize } from '../../../shared/image-sizing.ts';

const KEEP_ORIGINAL_KEY = 'novelstudio:keepOriginalImages';

/** The "Keep original" checkbox is remembered for the insert dialog and for pasted and dropped images. */
export function getKeepOriginal(): boolean {
  try {
    return localStorage.getItem(KEEP_ORIGINAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function setKeepOriginal(keep: boolean): void {
  try {
    localStorage.setItem(KEEP_ORIGINAL_KEY, keep ? '1' : '0');
  } catch {
    // The choice just is not remembered.
  }
}

function newName(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name || 'image'}.${extension}`;
}

/**
 * IMG-06: shrinks a large image to at most 2,400 px on its long edge and re-encodes it as WebP. The
 * original is returned unchanged when it is a GIF, needs no work, the browser cannot produce WebP,
 * the result is not smaller, or anything fails.
 */
export async function optimizeImage(file: File): Promise<File> {
  try {
    if (file.type === 'image/gif') return file;
    // `imageOrientation` applies the EXIF rotation, so the result is upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const facts = {
        width: bitmap.width,
        height: bitmap.height,
        bytes: file.size,
        mime: file.type,
        animated: false,
      };
      if (!needsOptimizing(facts)) return file;
      const size = targetSize(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      );
      if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
      return new File([blob], newName(file.name, 'webp'), { type: 'image/webp' });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

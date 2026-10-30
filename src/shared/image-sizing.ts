/** Decisions for optimizing an image before upload (IMG-06). The browser part lives in the client. */

export const MAX_IMAGE_EDGE = 2400;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
/** The insert dialog warns when a book's images pass this total (IMG-14). */
export const IMAGE_TOTAL_WARN_BYTES = 200 * 1024 * 1024;

export interface ImageFacts {
  width: number;
  height: number;
  bytes: number;
  mime: string;
  /** True for animated images; only GIFs are treated as such. */
  animated: boolean;
}

/** An image is optimized when its long edge is over 2,400 px or its file is over 1.5 MB. Animated GIFs never are. */
export function needsOptimizing({ width, height, bytes, mime, animated }: ImageFacts): boolean {
  if (animated || mime === 'image/gif') return false;
  return Math.max(width, height) > MAX_IMAGE_EDGE || bytes > MAX_IMAGE_BYTES;
}

/** The size to draw at: the long edge is at most `maxEdge`, the aspect ratio is kept, nothing is enlarged. */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge || long <= 0) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `1.5 MB`, `320 KB`, `12 B`: sizes in the picker. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

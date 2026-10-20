export interface CoverColors {
  background: string;
  foreground: string;
}

/** Stable, calm colour derived from a book ID (FNV-1a hash → hue). */
export function coverColors(bookId: string): CoverColors {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bookId.length; i++) {
    hash ^= bookId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hue = hash % 360;
  return {
    background: `hsl(${hue} 32% 36%)`,
    foreground: '#faf8f4',
  };
}

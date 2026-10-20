import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/connection.ts';
import { writeFileAtomic } from '../config.ts';
import { insertAsset, type AssetMime, type AssetRow } from '../repos/assets.ts';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const EXTENSIONS: Record<AssetMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function startsWith(buf: Uint8Array, offset: number, bytes: readonly number[]): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** Identifies the image type from its magic bytes only; names and client-sent MIME types are ignored. */
export function sniffImage(buf: Uint8Array): AssetMime | null {
  if (startsWith(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, 0, ascii('GIF87a')) || startsWith(buf, 0, ascii('GIF89a'))) {
    return 'image/gif';
  }
  if (startsWith(buf, 0, ascii('RIFF')) && startsWith(buf, 8, ascii('WEBP'))) return 'image/webp';
  return null;
}

export function assetFilePath(assetsDir: string, asset: AssetRow): string {
  return path.join(assetsDir, asset.bookId, `${asset.id}.${EXTENSIONS[asset.mime]}`);
}

/** The original name is display-only; strip path parts and control characters. */
export function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = path.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '');
  return base.slice(0, 200) || 'image';
}

/** Writes the file under a generated name, then records it; the file is removed if the insert fails. */
export function storeImage(
  db: Db,
  assetsDir: string,
  bookId: string,
  fileName: string,
  data: Buffer,
  mime: AssetMime,
  now: string,
): AssetRow {
  const asset: AssetRow = {
    id: crypto.randomUUID(),
    bookId,
    fileName: cleanFileName(fileName),
    mime,
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    createdAt: now,
  };
  const file = assetFilePath(assetsDir, asset);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileAtomic(file, data);
  try {
    insertAsset(db, asset);
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
  return asset;
}

export function removeAssetFile(assetsDir: string, asset: AssetRow): void {
  fs.rmSync(assetFilePath(assetsDir, asset), { force: true });
}

import fs from 'node:fs';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  copyAssetBodySchema,
  type Asset,
  type AssetListResponse,
} from '../../shared/schemas/book.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { ApiError, parseOrThrow } from '../errors.ts';
import { getAsset, listBookAssets, totalAssetBytes } from '../repos/assets.ts';
import { assetFilePath, MAX_IMAGE_BYTES, sniffImage, storeImage } from '../services/assets.ts';
import type { LibraryService } from '../services/library.ts';

const bookParams = z.object({ id: z.uuid() });
const assetParams = z.object({ bookId: z.uuid(), assetId: z.uuid() });

const tooLarge = () => new ApiError(413, 'FILE_TOO_LARGE', 'Images can be at most 20 MB.');

export function registerAssetRoutes(
  app: FastifyInstance,
  db: Db,
  paths: DataPaths,
  library: LibraryService,
): void {
  // Encapsulated so the multipart parser only applies to uploads.
  void app.register(async (scope) => {
    await scope.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

    scope.post('/api/books/:id/assets', async (request, reply) => {
      const { id } = parseOrThrow(bookParams, request.params);
      library.requireLiveBook(id);
      if (!request.isMultipart()) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Expected a multipart file upload.');
      }
      const file = await request.file();
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'No file was uploaded.');

      let data: Buffer;
      try {
        data = await file.toBuffer();
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge();
        throw err;
      }
      if (file.file.truncated) throw tooLarge();

      const mime = sniffImage(data);
      if (!mime) {
        throw new ApiError(
          415,
          'UNSUPPORTED_IMAGE_TYPE',
          'Only PNG, JPEG, WebP and GIF images are allowed.',
        );
      }

      const now = new Date().toISOString();
      const asset = storeImage(db, paths.assetsDir, id, file.filename, data, mime, now);
      const body: Asset = {
        id: asset.id,
        bookId: asset.bookId,
        fileName: asset.fileName,
        mime: asset.mime,
        bytes: asset.bytes,
        url: `/assets/${asset.bookId}/${asset.id}`,
      };
      return reply.code(201).send(body);
    });
  });

  app.get('/api/books/:id/assets', async (request) => {
    const { id } = parseOrThrow(bookParams, request.params);
    library.requireBook(id);
    const body: AssetListResponse = {
      assets: listBookAssets(db, id).map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mime: a.mime,
        bytes: a.bytes,
        url: `/assets/${a.bookId}/${a.id}`,
        createdAt: a.createdAt,
      })),
      totalBytes: totalAssetBytes(db, id),
    };
    return body;
  });

  // Pasting an image copied from another book (IMG-10): the file is copied, never shared.
  app.post('/api/books/:id/assets/copy', async (request, reply) => {
    const { id } = parseOrThrow(bookParams, request.params);
    const { sourceBookId, assetId } = parseOrThrow(copyAssetBodySchema, request.body);
    library.requireLiveBook(id);
    const source = getAsset(db, assetId);
    if (!source || source.bookId !== sourceBookId) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }
    let data: Buffer;
    try {
      data = fs.readFileSync(assetFilePath(paths.assetsDir, source));
    } catch {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }
    if (data.length > MAX_IMAGE_BYTES) throw tooLarge();
    const mime = sniffImage(data);
    if (!mime) {
      throw new ApiError(
        415,
        'UNSUPPORTED_IMAGE_TYPE',
        'Only PNG, JPEG, WebP and GIF images are allowed.',
      );
    }
    const asset = storeImage(
      db,
      paths.assetsDir,
      id,
      source.fileName,
      data,
      mime,
      new Date().toISOString(),
    );
    const body: { asset: Asset } = {
      asset: {
        id: asset.id,
        bookId: asset.bookId,
        fileName: asset.fileName,
        mime: asset.mime,
        bytes: asset.bytes,
        url: `/assets/${asset.bookId}/${asset.id}`,
      },
    };
    return reply.code(201).send(body);
  });

  app.get('/assets/:bookId/:assetId', async (request, reply) => {
    const { bookId, assetId } = parseOrThrow(assetParams, request.params);
    const asset = getAsset(db, assetId);
    if (!asset || asset.bookId !== bookId) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }
    let data: Buffer;
    try {
      data = fs.readFileSync(assetFilePath(paths.assetsDir, asset));
    } catch {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    }
    return reply
      .type(asset.mime)
      .header('Content-Security-Policy', "default-src 'none'")
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(data);
  });
}

import fs from 'node:fs';
import path from 'node:path';
import type { Book, CreateBookBody, PatchBookBody } from '../../shared/schemas/book.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { deleteAsset, getAsset, type AssetRow } from '../repos/assets.ts';
import { isAssetInUse } from '../repos/codex.ts';
import {
  deleteBook,
  getBook,
  insertBook,
  setBookDeletedAt,
  updateBookFields,
} from '../repos/books.ts';
import { createHotBackup } from './hot-backup.ts';
import { removeAssetFile } from './assets.ts';

export class LibraryService {
  constructor(
    private readonly db: Db,
    private readonly paths: DataPaths,
  ) {}

  create(body: CreateBookBody): Book {
    return insertBook(this.db, body, new Date().toISOString());
  }

  requireBook(id: string): Book {
    const book = getBook(this.db, id);
    if (!book) throw new ApiError(404, 'NOT_FOUND', 'Book not found.');
    return book;
  }

  requireLiveBook(id: string): Book {
    const book = this.requireBook(id);
    if (book.deletedAt) throw new ApiError(409, 'BOOK_TRASHED', 'This book is in the trash.');
    return book;
  }

  update(id: string, patch: PatchBookBody): Book {
    const now = new Date().toISOString();
    const removed = this.db.transaction(() => {
      const book = this.requireLiveBook(id);
      const candidates: (string | null)[] = [];
      if (patch.coverAssetId !== undefined && patch.coverAssetId !== book.coverAssetId) {
        if (patch.coverAssetId !== null) {
          const asset = getAsset(this.db, patch.coverAssetId);
          if (!asset || asset.bookId !== id) {
            throw new ApiError(
              400,
              'INVALID_COVER',
              'Cover must be an image uploaded to this book.',
            );
          }
        }
        candidates.push(book.coverAssetId);
      }
      const background = patch.display?.backgroundImageAssetId;
      if (background !== undefined && background !== book.display.backgroundImageAssetId) {
        if (background !== null) {
          const asset = getAsset(this.db, background);
          if (!asset || asset.bookId !== id) {
            throw new ApiError(
              400,
              'INVALID_BACKGROUND',
              'The background must be an image uploaded to this book.',
            );
          }
        }
        candidates.push(book.display.backgroundImageAssetId);
      }
      updateBookFields(this.db, id, patch, now);

      // A replaced or removed image is deleted unless something else (cover, codex, background) uses it.
      const gone: AssetRow[] = [];
      for (const assetId of candidates) {
        const asset = assetId ? getAsset(this.db, assetId) : null;
        if (asset && !isAssetInUse(this.db, asset.id)) {
          deleteAsset(this.db, asset.id);
          gone.push(asset);
        }
      }
      return gone;
    })();
    for (const asset of removed) removeAssetFile(this.paths.assetsDir, asset);
    return this.requireBook(id);
  }

  trash(id: string): Book {
    this.requireLiveBook(id);
    setBookDeletedAt(this.db, id, new Date().toISOString());
    return this.requireBook(id);
  }

  restore(id: string): Book {
    const book = this.requireBook(id);
    if (!book.deletedAt)
      throw new ApiError(409, 'BOOK_NOT_TRASHED', 'This book is not in the trash.');
    setBookDeletedAt(this.db, id, null);
    return this.requireBook(id);
  }

  /** Irreversible: needs the exact title, and a hot backup is taken first. */
  purge(id: string, confirmTitle: string | undefined): void {
    const book = this.requireBook(id);
    if (!book.deletedAt) {
      throw new ApiError(409, 'BOOK_NOT_TRASHED', 'Move the book to the trash before deleting it.');
    }
    if (confirmTitle !== book.title) {
      throw new ApiError(
        400,
        'CONFIRM_TITLE_MISMATCH',
        'Type the exact book title to delete it permanently.',
      );
    }
    createHotBackup(this.db, this.paths.backupsDir);
    this.db.transaction(() => deleteBook(this.db, id))();
    fs.rmSync(path.join(this.paths.assetsDir, book.id), { recursive: true, force: true });
  }
}

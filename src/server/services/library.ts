import fs from 'node:fs';
import path from 'node:path';
import type { Book, CreateBookBody, PatchBookBody } from '../../shared/schemas/book.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { deleteAsset, getAsset } from '../repos/assets.ts';
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
    const replaced = this.db.transaction(() => {
      const book = this.requireLiveBook(id);
      let oldCover = null;
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
        oldCover = book.coverAssetId ? getAsset(this.db, book.coverAssetId) : null;
      }
      updateBookFields(this.db, id, patch, now);
      if (oldCover) deleteAsset(this.db, oldCover.id);
      return oldCover;
    })();
    if (replaced) removeAssetFile(this.paths.assetsDir, replaced);
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

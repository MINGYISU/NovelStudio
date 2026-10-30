import crypto from 'node:crypto';
import { fieldsFromTemplate, NEW_CATEGORY_TEMPLATE } from '../../shared/codex.ts';
import { DEFAULT_LOCALE, type Locale } from '../../shared/schemas/locale.ts';
import type {
  CodexCategory,
  CodexData,
  CodexEntry,
  CreateCategoryBody,
  CreateEntryBody,
  PatchCategoryBody,
  PatchEntryBody,
} from '../../shared/schemas/codex.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { deleteAsset, getAsset, type AssetRow } from '../repos/assets.ts';
import {
  countEntriesInCategory,
  deleteCategoryRow,
  deleteEntryRow,
  getCategory,
  getEntry,
  insertCategory,
  insertDefaultCategories,
  insertEntry,
  isAssetInUse,
  listCategories,
  listCategoryEntries,
  listEntries,
  setCategoryPositions,
  setEntryPositions,
  updateCategoryRow,
  updateEntryRow,
} from '../repos/codex.ts';
import { touchBook } from '../repos/nodes.ts';
import { removeAssetFile } from './assets.ts';
import type { LibraryService } from './library.ts';

const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found.`);

/** Moves `id` to `index` among `ids`; the index must be a valid final position. */
function reordered(ids: readonly string[], id: string, index: number): string[] {
  if (index > ids.length - 1) {
    throw new ApiError(400, 'INVALID_INDEX', `Index must be between 0 and ${ids.length - 1}.`);
  }
  const rest = ids.filter((x) => x !== id);
  rest.splice(index, 0, id);
  return rest;
}

export class CodexService {
  constructor(
    private readonly db: Db,
    private readonly paths: DataPaths,
    private readonly library: LibraryService,
  ) {}

  get(bookId: string): CodexData {
    this.library.requireBook(bookId);
    return {
      categories: listCategories(this.db, bookId),
      entries: listEntries(this.db, bookId),
    };
  }

  /**
   * CDX-01: creates the default categories for a book that has none. New books already get them
   * when created; this is the explicit "Add default categories" action (also for pre-M5 books).
   */
  seedDefaults(bookId: string, locale: Locale = DEFAULT_LOCALE): CodexCategory[] {
    return this.db.transaction(() => {
      this.library.requireLiveBook(bookId);
      if (listCategories(this.db, bookId).length === 0) {
        insertDefaultCategories(this.db, bookId, locale);
        touchBook(this.db, bookId, new Date().toISOString());
      }
      return listCategories(this.db, bookId);
    })();
  }

  createCategory(bookId: string, body: CreateCategoryBody): { category: CodexCategory } {
    return this.db.transaction(() => {
      this.library.requireLiveBook(bookId);
      const category: CodexCategory = {
        id: crypto.randomUUID(),
        bookId,
        name: body.name,
        position: listCategories(this.db, bookId).length,
        fieldTemplate: body.fieldTemplate ?? NEW_CATEGORY_TEMPLATE.map((f) => ({ ...f })),
      };
      insertCategory(this.db, category);
      touchBook(this.db, bookId, new Date().toISOString());
      return { category };
    })();
  }

  updateCategory(id: string, patch: PatchCategoryBody): { category: CodexCategory } {
    return this.db.transaction(() => {
      const category = this.requireCategory(id);
      this.library.requireLiveBook(category.bookId);
      updateCategoryRow(this.db, id, patch);
      touchBook(this.db, category.bookId, new Date().toISOString());
      return { category: this.requireCategory(id) };
    })();
  }

  moveCategory(id: string, index: number): { categories: CodexCategory[] } {
    return this.db.transaction(() => {
      const category = this.requireCategory(id);
      this.library.requireLiveBook(category.bookId);
      const ids = listCategories(this.db, category.bookId).map((c) => c.id);
      setCategoryPositions(this.db, reordered(ids, id, index));
      touchBook(this.db, category.bookId, new Date().toISOString());
      return { categories: listCategories(this.db, category.bookId) };
    })();
  }

  /** CDX-01: only an empty category can be deleted. */
  deleteCategory(id: string): { categories: CodexCategory[] } {
    return this.db.transaction(() => {
      const category = this.requireCategory(id);
      this.library.requireLiveBook(category.bookId);
      if (countEntriesInCategory(this.db, id) > 0) {
        throw new ApiError(
          409,
          'CATEGORY_NOT_EMPTY',
          'This category still has entries. Move or delete them first.',
        );
      }
      deleteCategoryRow(this.db, id);
      const rest = listCategories(this.db, category.bookId).map((c) => c.id);
      setCategoryPositions(this.db, rest);
      touchBook(this.db, category.bookId, new Date().toISOString());
      return { categories: listCategories(this.db, category.bookId) };
    })();
  }

  createEntry(bookId: string, body: CreateEntryBody): { entry: CodexEntry } {
    return this.db.transaction(() => {
      this.library.requireLiveBook(bookId);
      const category = this.requireCategory(body.categoryId);
      if (category.bookId !== bookId) throw notFound('Category');
      const now = new Date().toISOString();
      const entry: CodexEntry = {
        id: crypto.randomUUID(),
        bookId,
        categoryId: category.id,
        title: body.title,
        summary: body.summary ?? '',
        fields: fieldsFromTemplate(category.fieldTemplate),
        imageAssetId: null,
        imageUrl: null,
        position: countEntriesInCategory(this.db, category.id),
        createdAt: now,
        updatedAt: now,
      };
      insertEntry(this.db, entry);
      touchBook(this.db, bookId, now);
      return { entry };
    })();
  }

  updateEntry(id: string, patch: PatchEntryBody): { entry: CodexEntry } {
    const replaced = this.db.transaction(() => {
      const entry = this.requireEntry(id);
      this.library.requireLiveBook(entry.bookId);
      let oldAsset: AssetRow | null = null;
      if (patch.imageAssetId !== undefined && patch.imageAssetId !== entry.imageAssetId) {
        if (patch.imageAssetId !== null) {
          const asset = getAsset(this.db, patch.imageAssetId);
          if (!asset || asset.bookId !== entry.bookId) {
            throw new ApiError(
              400,
              'INVALID_IMAGE',
              'The image must be uploaded to this book first.',
            );
          }
        }
        oldAsset = entry.imageAssetId ? getAsset(this.db, entry.imageAssetId) : null;
      }
      const now = new Date().toISOString();
      updateEntryRow(this.db, id, patch, now);
      touchBook(this.db, entry.bookId, now);
      return this.dropIfUnused(oldAsset);
    })();
    if (replaced) removeAssetFile(this.paths.assetsDir, replaced);
    return { entry: this.requireEntry(id) };
  }

  moveEntry(id: string, index: number): { entries: CodexEntry[] } {
    return this.db.transaction(() => {
      const entry = this.requireEntry(id);
      this.library.requireLiveBook(entry.bookId);
      const ids = listCategoryEntries(this.db, entry.categoryId).map((e) => e.id);
      setEntryPositions(this.db, reordered(ids, id, index));
      touchBook(this.db, entry.bookId, new Date().toISOString());
      return { entries: listCategoryEntries(this.db, entry.categoryId) };
    })();
  }

  deleteEntry(id: string): { entries: CodexEntry[] } {
    const orphan = this.db.transaction(() => {
      const entry = this.requireEntry(id);
      this.library.requireLiveBook(entry.bookId);
      deleteEntryRow(this.db, id);
      setEntryPositions(
        this.db,
        listCategoryEntries(this.db, entry.categoryId).map((e) => e.id),
      );
      touchBook(this.db, entry.bookId, new Date().toISOString());
      const asset = entry.imageAssetId ? getAsset(this.db, entry.imageAssetId) : null;
      return { asset: this.dropIfUnused(asset), entry };
    })();
    if (orphan.asset) removeAssetFile(this.paths.assetsDir, orphan.asset);
    return { entries: listCategoryEntries(this.db, orphan.entry.categoryId) };
  }

  private requireCategory(id: string): CodexCategory {
    const category = getCategory(this.db, id);
    if (!category) throw notFound('Category');
    return category;
  }

  private requireEntry(id: string): CodexEntry {
    const entry = getEntry(this.db, id);
    if (!entry) throw notFound('Entry');
    return entry;
  }

  /** Deletes the asset row when nothing uses it any more; the caller removes the file after commit. */
  private dropIfUnused(asset: AssetRow | null): AssetRow | null {
    if (!asset || isAssetInUse(this.db, asset.id)) return null;
    deleteAsset(this.db, asset.id);
    return asset;
  }
}

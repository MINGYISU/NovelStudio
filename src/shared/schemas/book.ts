import { z } from 'zod';
import { displaySettingsSchema } from './display.ts';
import { localeSchema } from './locale.ts';
import { foreshadowSettingsSchema } from './foreshadow.ts';
import { structureSettingsSchema } from './structure.ts';

export const TITLE_MAX = 200;
export const AUTHOR_MAX = 200;
export const DESCRIPTION_MAX = 5000;

const title = z.string().trim().min(1, 'Title is required.').max(TITLE_MAX);
const author = z.string().trim().max(AUTHOR_MAX);
const description = z.string().trim().max(DESCRIPTION_MAX);

export const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  description: z.string(),
  coverAssetId: z.string().nullable(),
  coverUrl: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
  structure: structureSettingsSchema,
  display: displaySettingsSchema,
  foreshadow: foreshadowSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Book = z.infer<typeof bookSchema>;

export const bookListSchema = z.object({ books: z.array(bookSchema) });

export const createBookBodySchema = z.object({
  title,
  author: author.optional(),
  description: description.optional(),
  /** Language of the default Codex categories and the numbering preset (I18N-06); default `en`. */
  locale: localeSchema.optional(),
});
export type CreateBookBody = z.infer<typeof createBookBodySchema>;

/** `coverAssetId: null` removes the cover; a new cover is an uploaded asset id. */
export const patchBookBodySchema = z
  .object({
    title: title.optional(),
    author: author.optional(),
    description: description.optional(),
    coverAssetId: z.uuid().nullable().optional(),
    structure: structureSettingsSchema.optional(),
    display: displaySettingsSchema.optional(),
    foreshadow: foreshadowSettingsSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchBookBody = z.infer<typeof patchBookBodySchema>;

export const BOOK_SORTS = ['modified', 'title'] as const;
export const bookSortSchema = z.enum(BOOK_SORTS);
export type BookSort = z.infer<typeof bookSortSchema>;

export const listBooksQuerySchema = z.object({
  sort: bookSortSchema.default('modified'),
  trashed: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
});

export const deleteBookQuerySchema = z.object({
  purge: z.enum(['0', '1']).default('0'),
  confirmTitle: z.string().optional(),
});

export const assetSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  fileName: z.string(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: z.number().int().nonnegative(),
  url: z.string(),
});
export type Asset = z.infer<typeof assetSchema>;

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

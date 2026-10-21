import { z } from 'zod';

export const CODEX_NAME_MAX = 100;
export const CODEX_TITLE_MAX = 200;
export const CODEX_SUMMARY_MAX = 2000;
export const CODEX_LABEL_MAX = 80;
export const CODEX_VALUE_MAX = 100_000;
export const CODEX_MAX_FIELDS = 200;

export const CODEX_FIELD_TYPES = ['text', 'longtext'] as const;
export type CodexFieldType = (typeof CODEX_FIELD_TYPES)[number];

/** Keys are stable identifiers; renaming a field only changes its label. */
const fieldKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Invalid field key.');
const fieldLabel = z.string().trim().min(1).max(CODEX_LABEL_MAX);
const fieldType = z.enum(CODEX_FIELD_TYPES);

function uniqueKeys(items: { key: string }[]): boolean {
  return new Set(items.map((i) => i.key)).size === items.length;
}

export const codexFieldDefSchema = z.object({ key: fieldKey, label: fieldLabel, type: fieldType });
export type CodexFieldDef = z.infer<typeof codexFieldDefSchema>;

export const codexFieldSchema = codexFieldDefSchema.extend({
  value: z.string().max(CODEX_VALUE_MAX),
});
export type CodexField = z.infer<typeof codexFieldSchema>;

const keysMessage = { message: 'Field keys must be unique.' };
export const fieldTemplateSchema = z
  .array(codexFieldDefSchema)
  .max(CODEX_MAX_FIELDS)
  .refine(uniqueKeys, keysMessage);
export const entryFieldsSchema = z
  .array(codexFieldSchema)
  .max(CODEX_MAX_FIELDS)
  .refine(uniqueKeys, keysMessage);

const name = z.string().trim().min(1).max(CODEX_NAME_MAX);
const title = z.string().trim().min(1).max(CODEX_TITLE_MAX);
const summary = z.string().trim().max(CODEX_SUMMARY_MAX);

export const codexCategorySchema = z.object({
  id: z.string(),
  bookId: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  fieldTemplate: z.array(codexFieldDefSchema),
});
export type CodexCategory = z.infer<typeof codexCategorySchema>;

export const codexEntrySchema = z.object({
  id: z.string(),
  bookId: z.string(),
  categoryId: z.string(),
  title: z.string(),
  summary: z.string(),
  fields: z.array(codexFieldSchema),
  imageAssetId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CodexEntry = z.infer<typeof codexEntrySchema>;

export const codexResponseSchema = z.object({
  categories: z.array(codexCategorySchema),
  entries: z.array(codexEntrySchema),
});
export type CodexData = z.infer<typeof codexResponseSchema>;

export const categoryResponseSchema = z.object({ category: codexCategorySchema });
export const categoriesResponseSchema = z.object({ categories: z.array(codexCategorySchema) });
export const entryResponseSchema = z.object({ entry: codexEntrySchema });
export const entriesResponseSchema = z.object({ entries: z.array(codexEntrySchema) });

export const createCategoryBodySchema = z.object({
  name,
  fieldTemplate: fieldTemplateSchema.optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

export const patchCategoryBodySchema = z
  .object({ name: name.optional(), fieldTemplate: fieldTemplateSchema.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchCategoryBody = z.infer<typeof patchCategoryBodySchema>;

export const moveBodySchema = z.object({ index: z.number().int().nonnegative() });
export type MoveBody = z.infer<typeof moveBodySchema>;

export const createEntryBodySchema = z.object({
  categoryId: z.uuid(),
  title,
  summary: summary.optional(),
});
export type CreateEntryBody = z.infer<typeof createEntryBodySchema>;

export const patchEntryBodySchema = z
  .object({
    title: title.optional(),
    summary: summary.optional(),
    fields: entryFieldsSchema.optional(),
    imageAssetId: z.uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchEntryBody = z.infer<typeof patchEntryBodySchema>;

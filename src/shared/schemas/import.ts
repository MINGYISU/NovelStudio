import { z } from 'zod';
import { bookSchema, TITLE_MAX } from './book.ts';
import { localeSchema } from './locale.ts';

/** Text and Markdown imports are capped; a larger file is refused outright, never truncated. */
export const MAX_TEXT_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_IMPORT_LABEL = '25 MB';

export const IMPORT_PRESETS = ['english', 'chinese'] as const;

export const importTextFieldsSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  detect: z.enum(['0', '1']).default('1'),
  title: z.string().trim().min(1).max(TITLE_MAX).optional(),
  preset: z.enum(IMPORT_PRESETS).optional(),
  locale: localeSchema.optional(),
});

export const importPreviewSectionSchema = z.object({
  kind: z.enum(['volume', 'chapter']),
  title: z.string(),
  parentIndex: z.number().int().nullable(),
  unnumbered: z.boolean(),
  wordCount: z.number().int().nonnegative(),
  excerpt: z.string(),
});

export const importPreviewResponseSchema = z.object({
  encoding: z.string(),
  detected: z.boolean(),
  suggestedPreset: z.enum(IMPORT_PRESETS),
  totalWords: z.number().int().nonnegative(),
  sections: z.array(importPreviewSectionSchema),
  warnings: z.array(z.string()),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

export const importTextCommitResponseSchema = z.object({
  book: bookSchema,
  sectionCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type ImportTextCommitResponse = z.infer<typeof importTextCommitResponseSchema>;

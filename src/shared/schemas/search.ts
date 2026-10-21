import { z } from 'zod';

export const SEARCH_QUERY_MAX = 200;
export const REPLACEMENT_MAX = 2000;

export const searchBodySchema = z.object({
  query: z.string().min(1).max(SEARCH_QUERY_MAX),
  caseSensitive: z.boolean().default(false),
});
export type SearchBody = z.input<typeof searchBodySchema>;

export const searchResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  sections: z.array(
    z.object({
      nodeId: z.string(),
      count: z.number().int().positive(),
      excerpts: z.array(z.object({ before: z.string(), match: z.string(), after: z.string() })),
    }),
  ),
  /** Sections whose stored text could not be read; they are neither searched nor changed. */
  skipped: z.number().int().nonnegative(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const replaceBodySchema = searchBodySchema.extend({
  replacement: z.string().max(REPLACEMENT_MAX),
  /** Only these sections are changed; omitted means every section with a match. */
  nodeIds: z.array(z.uuid()).max(5000).optional(),
});
export type ReplaceBody = z.input<typeof replaceBodySchema>;

export const replaceResponseSchema = z.object({
  replaced: z.number().int().nonnegative(),
  sections: z.array(
    z.object({
      nodeId: z.string(),
      count: z.number().int().positive(),
      rev: z.number().int().nonnegative(),
      wordCount: z.number().int().nonnegative(),
    }),
  ),
  skipped: z.number().int().nonnegative(),
});
export type ReplaceResponse = z.infer<typeof replaceResponseSchema>;

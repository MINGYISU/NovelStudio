import { z } from 'zod';
import { NODE_KINDS, NODE_STATUSES } from '../types.ts';
import { contentSchema } from './content.ts';

export const NODE_TITLE_MAX = 200;
export const NODE_SYNOPSIS_MAX = 5000;

const title = z.string().trim().max(NODE_TITLE_MAX);
const synopsis = z.string().trim().max(NODE_SYNOPSIS_MAX);

export const nodeKindSchema = z.enum(NODE_KINDS);
export const nodeStatusSchema = z.enum(NODE_STATUSES);

export const treeNodeSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  parentId: z.string().nullable(),
  kind: nodeKindSchema,
  title: z.string(),
  position: z.number().int().nonnegative(),
  numbered: z.boolean(),
  status: nodeStatusSchema,
  synopsis: z.string(),
  wordCount: z.number().int().nonnegative(),
  deletedAt: z.string().nullable(),
});

export const treeResponseSchema = z.object({ nodes: z.array(treeNodeSchema) });
export const nodeResponseSchema = z.object({ node: treeNodeSchema });
export const nodeAndTreeResponseSchema = z.object({
  node: treeNodeSchema,
  nodes: z.array(treeNodeSchema),
});

/** Omitting `index` appends; omitting `numbered` uses the kind's default from the book settings. */
export const createNodeBodySchema = z.object({
  kind: nodeKindSchema,
  parentId: z.uuid().nullable(),
  index: z.number().int().nonnegative().optional(),
  title: title.optional(),
  numbered: z.boolean().optional(),
});
export type CreateNodeBody = z.infer<typeof createNodeBodySchema>;

export const patchNodeBodySchema = z
  .object({
    title: title.optional(),
    status: nodeStatusSchema.optional(),
    synopsis: synopsis.optional(),
    numbered: z.boolean().optional(),
    /** An image of the same book, or `null` to remove the header image (IMG-21). */
    headerAssetId: z.uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchNodeBody = z.infer<typeof patchNodeBodySchema>;

export const moveNodeBodySchema = z.object({
  parentId: z.uuid().nullable(),
  index: z.number().int().nonnegative(),
});
export type MoveNodeBody = z.infer<typeof moveNodeBodySchema>;

/** A section with its body, as opened in the editor. `rev` is the revision the next save is based on. */
export const nodeContentSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  content: contentSchema,
  rev: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  headerAssetId: z.string().nullable(),
  headerImageUrl: z.string().nullable(),
});
export type NodeContent = z.infer<typeof nodeContentSchema>;
export const nodeContentResponseSchema = z.object({ node: nodeContentSchema });

export const saveContentBodySchema = z.object({
  content: contentSchema,
  rev: z.number().int().nonnegative(),
});
export type SaveContentBody = z.infer<typeof saveContentBodySchema>;

export const saveContentResponseSchema = z.object({
  rev: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
});
export type SaveContentResponse = z.infer<typeof saveContentResponseSchema>;

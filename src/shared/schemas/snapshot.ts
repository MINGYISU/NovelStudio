import { z } from 'zod';
import { nodeContentSchema } from './node.ts';

export const SNAPSHOT_REASONS = ['open', 'interval', 'before-replace', 'before-restore'] as const;
export const snapshotReasonSchema = z.enum(SNAPSHOT_REASONS);
export type SnapshotReason = z.infer<typeof snapshotReasonSchema>;

/** Newest snapshots kept per section (SNAP-01). */
export const SNAPSHOTS_PER_NODE = 50;
/** Minimum time between automatic snapshots of one section while it is being edited. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

export const snapshotSummarySchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  wordCount: z.number().int().nonnegative(),
  reason: snapshotReasonSchema,
  createdAt: z.string(),
  excerpt: z.string(),
});
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

export const snapshotListResponseSchema = z.object({ snapshots: z.array(snapshotSummarySchema) });

export const snapshotDetailResponseSchema = z.object({
  snapshot: snapshotSummarySchema.extend({ plainText: z.string() }),
});

export const restoreSnapshotResponseSchema = z.object({ node: nodeContentSchema });

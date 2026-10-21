import { z } from 'zod';

export const restoreMarkerSchema = z.object({
  name: z.string(),
  requestedAt: z.string(),
  error: z.string().optional(),
});

export const hotBackupStateSchema = z.object({
  backups: z.array(z.object({ name: z.string(), bytes: z.number(), createdAt: z.string() })),
  pending: restoreMarkerSchema.nullable(),
  failed: restoreMarkerSchema.nullable(),
});
export type HotBackupStateResponse = z.infer<typeof hotBackupStateSchema>;

export const restoreHotBackupResponseSchema = z.object({ pending: restoreMarkerSchema });

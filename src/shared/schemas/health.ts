import { z } from 'zod';

export const healthSchema = z.object({
  status: z.literal('ok'),
  mode: z.enum(['development', 'production']),
  schemaVersion: z.number().int().nullable(),
});

export type Health = z.infer<typeof healthSchema>;

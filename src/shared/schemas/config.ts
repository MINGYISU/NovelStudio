import { z } from 'zod';

export const coldBackupLastSchema = z.object({
  at: z.iso.datetime(),
  file: z.string(),
});

/** Outcome of the newest automatic daily run (COLD-11); `date` is the local day it counts for. */
export const autoDailyLastSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  at: z.iso.datetime(),
  ok: z.boolean(),
  message: z.string(),
});
export type AutoDailyLast = z.infer<typeof autoDailyLastSchema>;

export const coldBackupConfigSchema = z.object({
  dir: z.string().nullable().default(null),
  keepNewestPerBook: z.number().int().positive().nullable().default(null),
  includeSnapshots: z.boolean().default(false),
  reminderDays: z.number().int().positive().default(7),
  autoDaily: z.boolean().default(false),
  autoDailyLast: autoDailyLastSchema.nullable().default(null),
  last: z.record(z.string(), coldBackupLastSchema).default({}),
});

export const appConfigSchema = z.object({
  configVersion: z.literal(1).default(1),
  coldBackup: coldBackupConfigSchema.default(() => coldBackupConfigSchema.parse({})),
  ui: z
    .object({
      lastOpenedBookId: z.string().nullable().default(null),
    })
    .default({ lastOpenedBookId: null }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

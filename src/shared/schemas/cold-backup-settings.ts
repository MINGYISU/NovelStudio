import { z } from 'zod';
import { bookSchema } from './book.ts';
import { statsSchema } from './cold-backup.ts';
import { autoDailyLastSchema } from './config.ts';

const dir = z.string().trim().min(1).max(4096);

export const coldBackupSettingsSchema = z.object({
  dir: z.string().nullable(),
  keepNewestPerBook: z.number().int().positive().nullable(),
  includeSnapshots: z.boolean(),
  reminderDays: z.number().int().positive(),
  autoDaily: z.boolean(),
});
export type ColdBackupSettings = z.infer<typeof coldBackupSettingsSchema>;

export const coldBackupSettingsResponseSchema = z.object({
  settings: coldBackupSettingsSchema,
  last: z.record(z.string(), z.object({ at: z.string(), file: z.string() })),
  autoDailyLast: autoDailyLastSchema.nullable(),
  pickerSupported: z.boolean(),
});
export type ColdBackupSettingsResponse = z.infer<typeof coldBackupSettingsResponseSchema>;

export const putColdBackupSettingsBodySchema = z
  .object({
    dir: dir.nullable().optional(),
    keepNewestPerBook: z.number().int().min(1).max(1000).nullable().optional(),
    includeSnapshots: z.boolean().optional(),
    reminderDays: z.number().int().min(1).max(365).optional(),
    autoDaily: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PutColdBackupSettingsBody = z.infer<typeof putColdBackupSettingsBodySchema>;

export const validateLocationBodySchema = z.object({ dir });

export const validateLocationResponseSchema = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string(),
  /** True when the final folder does not exist yet and the first export would create it. */
  willCreate: z.boolean(),
});
export type ValidateLocationResponse = z.infer<typeof validateLocationResponseSchema>;

export const chooseFolderResponseSchema = z.object({ path: z.string().nullable() });

export const exportBodySchema = z.object({
  dir: dir.optional(),
  includeSnapshots: z.boolean().optional(),
});
export type ExportBody = z.infer<typeof exportBodySchema>;

export const exportResultSchema = z.object({
  bookId: z.string(),
  title: z.string(),
  file: z.string(),
  checksumFile: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  exportedAt: z.string(),
  stats: statsSchema,
  warnings: z.array(z.string()),
});
export type ExportResult = z.infer<typeof exportResultSchema>;
export const exportResponseSchema = z.object({ result: exportResultSchema });

export const exportAllResponseSchema = z.object({
  results: z.array(
    z.discriminatedUnion('ok', [
      z.object({
        ok: z.literal(true),
        bookId: z.string(),
        title: z.string(),
        result: exportResultSchema,
      }),
      z.object({
        ok: z.literal(false),
        bookId: z.string(),
        title: z.string(),
        error: z.object({ code: z.string(), message: z.string() }),
      }),
    ]),
  ),
});
export type ExportAllResponse = z.infer<typeof exportAllResponseSchema>;

export const verifyResultSchema = z.object({
  file: z.string(),
  ok: z.boolean(),
  checksum: z.enum(['ok', 'mismatch', 'missing']),
  problems: z.array(z.string()),
  stats: statsSchema.nullable(),
});
export type VerifyResult = z.infer<typeof verifyResultSchema>;

export const verifyBodySchema = z.object({ bookId: z.uuid().optional() });
export const verifyResponseSchema = z.object({
  results: z.array(verifyResultSchema.extend({ bookId: z.string() })),
});

export const importResponseSchema = z.object({
  book: bookSchema,
  warnings: z.array(z.string()),
  remapped: z.boolean(),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;

import { z } from 'zod';

export const FORESHADOW_STATUSES = ['planned', 'planted', 'paid_off', 'abandoned'] as const;
export type ForeshadowStatus = (typeof FORESHADOW_STATUSES)[number];

export const STATUS_LABELS: Record<ForeshadowStatus, string> = {
  planned: 'Planned',
  planted: 'Planted',
  paid_off: 'Paid off',
  abandoned: 'Abandoned',
};

export const OCCURRENCE_ROLES = ['setup', 'hint', 'payoff'] as const;
export type OccurrenceRole = (typeof OCCURRENCE_ROLES)[number];

export const ROLE_LABELS: Record<OccurrenceRole, string> = {
  setup: 'Setup',
  hint: 'Hint',
  payoff: 'Payoff',
};

export const ROLE_GLYPHS: Record<OccurrenceRole, string> = {
  setup: '●',
  hint: '◐',
  payoff: '★',
};

export const DEFAULT_THREAD_COLOR = '#c0841a';
export const THREAD_TITLE_MAX = 200;
export const THREAD_TEXT_MAX = 5000;
export const OCCURRENCE_TEXT_MAX = 2000;

export const DEFAULT_DORMANT_AFTER = 10;
export const DORMANT_AFTER_MAX = 1000;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must look like #c0841a.');
const threadTitle = z.string().trim().min(1, 'Title is required.').max(THREAD_TITLE_MAX);

/** `books.settings.foreshadow`; an absent or invalid value falls back to the defaults. */
export const foreshadowSettingsSchema = z.object({
  dormantAfter: z.number().int().min(1).max(DORMANT_AFTER_MAX).default(DEFAULT_DORMANT_AFTER),
});
export type ForeshadowSettings = z.infer<typeof foreshadowSettingsSchema>;
export const DEFAULT_FORESHADOW_SETTINGS: ForeshadowSettings = foreshadowSettingsSchema.parse({});

export const occurrenceSchema = z.object({
  id: z.string(),
  foreshadowId: z.string(),
  nodeId: z.string().nullable(),
  role: z.enum(OCCURRENCE_ROLES),
  excerpt: z.string(),
  note: z.string(),
  anchored: z.boolean(),
  anchorState: z.enum(['present', 'missing']).nullable(),
  createdAt: z.string(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

export const threadSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(FORESHADOW_STATUSES),
  color: z.string(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  occurrences: z.array(occurrenceSchema),
});
export type Thread = z.infer<typeof threadSchema>;

export const threadsResponseSchema = z.object({ threads: z.array(threadSchema) });
export const threadResponseSchema = z.object({ thread: threadSchema });

export const createThreadBodySchema = z.object({
  title: threadTitle,
  description: z.string().trim().max(THREAD_TEXT_MAX).optional(),
  status: z.enum(FORESHADOW_STATUSES).optional(),
  color: color.optional(),
  notes: z.string().trim().max(THREAD_TEXT_MAX).optional(),
});
export type CreateThreadBody = z.infer<typeof createThreadBodySchema>;

export const patchThreadBodySchema = createThreadBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchThreadBody = z.infer<typeof patchThreadBodySchema>;

export const createOccurrenceBodySchema = z.object({
  nodeId: z.uuid(),
  role: z.enum(OCCURRENCE_ROLES),
  excerpt: z.string().trim().max(OCCURRENCE_TEXT_MAX).optional(),
  note: z.string().trim().max(OCCURRENCE_TEXT_MAX).optional(),
});
export type CreateOccurrenceBody = z.infer<typeof createOccurrenceBodySchema>;

export const patchOccurrenceBodySchema = createOccurrenceBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });
export type PatchOccurrenceBody = z.infer<typeof patchOccurrenceBodySchema>;

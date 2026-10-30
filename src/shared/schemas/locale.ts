import { z } from 'zod';

export const LOCALES = ['en', 'zh-CN'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'en';

/** Body of the endpoints that create text for the user: the interface language of that moment (I18N-06). */
export const localeBodySchema = z.object({ locale: localeSchema.optional() });

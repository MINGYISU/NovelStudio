import { z } from 'zod';

export const DISPLAY_FONTS = ['serif', 'sans', 'mono', 'cjk-serif', 'cjk-sans'] as const;
export type DisplayFont = (typeof DISPLAY_FONTS)[number];
export const DISPLAY_THEMES = ['light', 'dark', 'sepia'] as const;

/** Only system fonts are offered (DISP-03): no font files are loaded from anywhere. */
export const FONT_STACKS: Record<DisplayFont, string> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  'cjk-serif': "'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', Georgia, serif",
  'cjk-sans': "'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC', system-ui, sans-serif",
};

export const FONT_LABELS: Record<DisplayFont, string> = {
  serif: 'Serif',
  sans: 'Sans-serif',
  mono: 'Monospace',
  'cjk-serif': 'Songti (Chinese serif)',
  'cjk-sans': 'PingFang (Chinese sans)',
};

export const displaySettingsSchema = z.object({
  fontFamily: z.enum(DISPLAY_FONTS).default('serif'),
  fontSize: z.number().min(12).max(32).default(18),
  lineHeight: z.number().min(1.2).max(2.4).default(1.7),
  firstLineIndent: z.number().min(0).max(4).default(0),
  editorWidth: z.number().int().min(480).max(1200).default(720),
  theme: z.enum(DISPLAY_THEMES).default('light'),
  paragraphSpacing: z.number().min(0).max(2).default(0.6),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  backgroundImageAssetId: z.uuid().nullable().default(null),
  backgroundImageOpacity: z.number().min(0.05).max(1).default(0.3),
  showImages: z.boolean().default(true),
});
export type DisplaySettings = z.infer<typeof displaySettingsSchema>;

export const DEFAULT_DISPLAY: DisplaySettings = displaySettingsSchema.parse({});

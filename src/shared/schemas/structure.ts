import { z } from 'zod';
import { NODE_KINDS, NODE_RANK, type NodeKind } from '../types.ts';

export const RESTART_SCOPES = ['book', 'volume', 'part', 'chapter'] as const;
export type RestartScope = (typeof RESTART_SCOPES)[number];

export const kindStructureSchema = z.object({
  label: z.string().max(40),
  format: z.string().max(80),
  restartWithin: z.enum(RESTART_SCOPES),
  separator: z.string().max(20),
  defaultNumbered: z.boolean(),
});
export type KindStructure = z.infer<typeof kindStructureSchema>;

export const structureSettingsSchema = z
  .object({
    volume: kindStructureSchema,
    part: kindStructureSchema,
    chapter: kindStructureSchema,
    scene: kindStructureSchema,
  })
  .superRefine((settings, ctx) => {
    for (const kind of NODE_KINDS) {
      const scope = settings[kind].restartWithin;
      if (scope !== 'book' && NODE_RANK[scope] >= NODE_RANK[kind]) {
        ctx.addIssue({
          code: 'custom',
          path: [kind, 'restartWithin'],
          message: `A ${kind} can only restart within the book or a higher kind.`,
        });
      }
    }
  });
export type StructureSettings = Record<NodeKind, KindStructure>;

export const DEFAULT_STRUCTURE: StructureSettings = {
  volume: {
    label: 'Volume',
    format: 'Volume {n:roman}',
    restartWithin: 'book',
    separator: ' — ',
    defaultNumbered: true,
  },
  part: {
    label: 'Part',
    format: 'Part {n}',
    restartWithin: 'book',
    separator: ' — ',
    defaultNumbered: true,
  },
  chapter: {
    label: 'Chapter',
    format: 'Chapter {n}',
    restartWithin: 'book',
    separator: ' — ',
    defaultNumbered: true,
  },
  scene: {
    label: 'Scene',
    format: 'Scene {n}',
    restartWithin: 'chapter',
    separator: ' — ',
    defaultNumbered: false,
  },
};

/** Shape of the `books.settings` JSON column; later milestones add display and foreshadow. */
export const bookSettingsSchema = z.object({
  structure: structureSettingsSchema.default(DEFAULT_STRUCTURE),
});

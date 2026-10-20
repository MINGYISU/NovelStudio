import { z } from 'zod';
import { NODE_KINDS, NODE_STATUSES } from '../types.ts';
import { snapshotReasonSchema } from './snapshot.ts';

export const COLD_BACKUP_FORMAT = 'novelstudio.cold-backup';
export const COLD_BACKUP_VERSION = 1;

const id = z.uuid();
const timestamp = z.string().min(1);
/** Rich text as ProseMirror JSON; checked on restore (a bad one is rebuilt from `plainText`), never at export. */
const richContent = z.record(z.string(), z.unknown()).nullable();

export const statsSchema = z.object({
  sections: z.number().int().nonnegative(),
  trashedSections: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  codexCategories: z.number().int().nonnegative(),
  codexEntries: z.number().int().nonnegative(),
  maps: z.number().int().nonnegative(),
  foreshadows: z.number().int().nonnegative(),
  occurrences: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  snapshots: z.number().int().nonnegative(),
});
export type ColdBackupStats = z.infer<typeof statsSchema>;

export interface ColdSection {
  id: string;
  kind: (typeof NODE_KINDS)[number];
  title: string;
  displayTitle: string;
  numbered: boolean;
  status: (typeof NODE_STATUSES)[number];
  synopsis: string;
  wordCount: number;
  plainText: string;
  content: Record<string, unknown> | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
  children: ColdSection[];
}

export interface ColdTrashedSection extends ColdSection {
  deletedAt: string;
  originalParentId: string | null;
}

const sectionFields = {
  id,
  kind: z.enum(NODE_KINDS),
  title: z.string(),
  displayTitle: z.string(),
  numbered: z.boolean(),
  status: z.enum(NODE_STATUSES),
  synopsis: z.string(),
  wordCount: z.number().int().nonnegative(),
  plainText: z.string(),
  content: richContent,
  rev: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const sectionSchema: z.ZodType<ColdSection> = z.lazy(() =>
  z.object({ ...sectionFields, children: z.array(sectionSchema) }),
);

export const trashedSectionSchema: z.ZodType<ColdTrashedSection> = z.object({
  ...sectionFields,
  children: z.array(sectionSchema),
  deletedAt: timestamp,
  originalParentId: id.nullable(),
});

export const coldBookSchema = z.object({
  id,
  title: z.string(),
  author: z.string(),
  description: z.string(),
  coverAssetId: id.nullable(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const codexFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'longtext']),
});

export const codexSchema = z.object({
  categories: z.array(
    z.object({
      id,
      name: z.string(),
      position: z.number().int().nonnegative(),
      fieldTemplate: z.array(codexFieldSchema),
    }),
  ),
  entries: z.array(
    z.object({
      id,
      categoryId: id,
      title: z.string(),
      summary: z.string(),
      fields: z.array(codexFieldSchema.extend({ value: z.string() })),
      imageAssetId: id.nullable(),
      position: z.number().int().nonnegative(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  ),
});

export const coldMapSchema = z.object({
  id,
  title: z.string(),
  template: z.string(),
  position: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
  data: z.record(z.string(), z.unknown()),
});

export const coldForeshadowSchema = z.object({
  id,
  title: z.string(),
  description: z.string(),
  status: z.string(),
  color: z.string(),
  notes: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  occurrences: z.array(
    z.object({
      id,
      nodeId: id.nullable(),
      role: z.enum(['setup', 'hint', 'payoff']),
      excerpt: z.string(),
      note: z.string(),
      anchored: z.boolean(),
      anchorState: z.enum(['present', 'missing']).nullable(),
      createdAt: timestamp,
    }),
  ),
});

export const coldAssetSchema = z.object({
  id,
  fileName: z.string(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  dataBase64: z.string(),
});
export type ColdAsset = z.infer<typeof coldAssetSchema>;

export const coldSnapshotSchema = z.object({
  id,
  nodeId: id,
  content: richContent,
  wordCount: z.number().int().nonnegative(),
  reason: snapshotReasonSchema,
  createdAt: timestamp,
});
export type ColdSnapshot = z.infer<typeof coldSnapshotSchema>;

/** Top-level keys are declared in the order they appear in the file (`_readme` first). */
export const coldBackupSchema = z.object({
  _readme: z.string(),
  format: z.literal(COLD_BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
  exportedAt: timestamp,
  app: z.object({
    name: z.string(),
    version: z.string(),
    dbSchemaVersion: z.number().int().nonnegative(),
  }),
  stats: statsSchema,
  warnings: z.array(z.string()),
  book: coldBookSchema,
  manuscript: z.array(sectionSchema),
  trash: z.array(trashedSectionSchema),
  codex: codexSchema,
  maps: z.array(coldMapSchema),
  foreshadows: z.array(coldForeshadowSchema),
  assets: z.array(coldAssetSchema),
  snapshots: z.array(coldSnapshotSchema).nullable(),
});
export type ColdBackupDoc = z.infer<typeof coldBackupSchema>;

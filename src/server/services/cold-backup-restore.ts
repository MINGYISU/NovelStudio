import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { docToPlainText } from '../../shared/prosemirror-text.ts';
import { contentSchema, docFromPlainText, type ContentDoc } from '../../shared/schemas/content.ts';
import {
  COLD_BACKUP_FORMAT,
  COLD_BACKUP_VERSION,
  coldBackupSchema,
  type ColdBackupDoc,
  type ColdSection,
} from '../../shared/schemas/cold-backup.ts';
import type { Book } from '../../shared/schemas/book.ts';
import { assertTreeInvariants, TreeInvariantError } from '../../shared/tree.ts';
import { countWords } from '../../shared/wordcount.ts';
import type { DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { insertAsset } from '../repos/assets.ts';
import { getBook } from '../repos/books.ts';
import {
  anyIdExists,
  insertBookRow,
  insertFullNodeRow,
  titleExists,
  type FullNodeRow,
} from '../repos/cold-backup.ts';
import { listNodes } from '../repos/nodes.ts';
import { insertSnapshot } from '../repos/snapshots.ts';
import { writeFileAtomic } from '../config.ts';
import { assetFilePath, cleanFileName, sniffImage } from './assets.ts';

const TITLE_MAX = 200;

export interface RestoreOptions {
  /** Hash from the `.sha256` sidecar, when the caller has it. */
  expectedSha256?: string | null;
  ignoreChecksum?: boolean;
  now?: Date;
}

export interface RestoreResult {
  book: Book;
  warnings: string[];
  remapped: boolean;
}

const invalid = (message: string) => new ApiError(400, 'INVALID_BACKUP', message);

/** Parses and validates the file; the version check runs first so a newer file gets a clear message. */
export function parseColdBackup(bytes: Buffer): ColdBackupDoc {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalid('The file is not valid JSON.');
  }
  const header = json as { format?: unknown; formatVersion?: unknown } | null;
  if (typeof header !== 'object' || header === null || header.format !== COLD_BACKUP_FORMAT) {
    throw invalid('This is not a NovelStudio cold backup.');
  }
  if (typeof header.formatVersion !== 'number' || !Number.isInteger(header.formatVersion)) {
    throw invalid('The file has no valid formatVersion.');
  }
  if (header.formatVersion > COLD_BACKUP_VERSION) {
    throw new ApiError(
      400,
      'UNSUPPORTED_FORMAT_VERSION',
      `This backup uses format version ${header.formatVersion}; this app understands up to ${COLD_BACKUP_VERSION}. Update NovelStudio to restore it.`,
    );
  }
  // Older versions would be upgraded here (COLD_BACKUP_FORMAT §8); version 1 is the only one so far.
  const parsed = coldBackupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(`Invalid backup at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? ''}`);
  }
  return parsed.data;
}

function restoredTitle(db: Db, title: string, now: Date): string {
  if (!titleExists(db, title)) return title;
  const suffix = ` (restored ${now.toISOString().slice(0, 10)})`;
  return title.slice(0, TITLE_MAX - suffix.length) + suffix;
}

function collectIds(doc: ColdBackupDoc): {
  nodeIds: string[];
  assetIds: string[];
  snapshotIds: string[];
} {
  const nodeIds: string[] = [];
  const visit = (s: ColdSection): void => {
    nodeIds.push(s.id);
    s.children.forEach(visit);
  };
  doc.manuscript.forEach(visit);
  doc.trash.forEach(visit);
  return {
    nodeIds,
    assetIds: doc.assets.map((a) => a.id),
    snapshotIds: (doc.snapshots ?? []).map((s) => s.id),
  };
}

function assertNoDuplicates(label: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length)
    throw invalid(`The backup contains duplicate ${label} ids.`);
}

/**
 * Restores a cold backup as a NEW book (COLD-07). If any id already exists in this database, every
 * id is regenerated and every reference remapped. Positions come from array order; plain text and
 * word counts are recomputed. Everything is inserted in one transaction; on any error nothing stays.
 */
export function restoreColdBackup(
  db: Db,
  paths: DataPaths,
  bytes: Buffer,
  options: RestoreOptions = {},
): RestoreResult {
  const now = options.now ?? new Date();
  const warnings: string[] = [];

  if (options.expectedSha256) {
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== options.expectedSha256.toLowerCase()) {
      if (!options.ignoreChecksum) {
        throw new ApiError(
          409,
          'CHECKSUM_MISMATCH',
          'The file does not match its .sha256 checksum. It may be damaged or edited.',
        );
      }
      warnings.push('The file does not match its .sha256 checksum; restored anyway.');
    }
  }

  const doc = parseColdBackup(bytes);
  const { nodeIds, assetIds, snapshotIds } = collectIds(doc);
  assertNoDuplicates('section', nodeIds);
  assertNoDuplicates('image', assetIds);
  assertNoDuplicates('snapshot', snapshotIds);

  if (doc.codex.categories.length + doc.codex.entries.length > 0) {
    warnings.push('Codex data is not supported by this version of the app and was skipped.');
  }
  if (doc.maps.length > 0)
    warnings.push('Story maps are not supported by this version and were skipped.');
  if (doc.foreshadows.length > 0) {
    warnings.push('Foreshadow threads are not supported by this version and were skipped.');
  }

  const remapped =
    anyIdExists(db, 'books', [doc.book.id]) ||
    anyIdExists(db, 'nodes', nodeIds) ||
    anyIdExists(db, 'assets', assetIds) ||
    anyIdExists(db, 'snapshots', snapshotIds);
  const ids = new Map<string, string>();
  for (const id of [doc.book.id, ...nodeIds, ...assetIds, ...snapshotIds]) {
    ids.set(id, remapped ? crypto.randomUUID() : id);
  }
  const mapped = (id: string): string => ids.get(id) as string;
  const bookId = mapped(doc.book.id);

  const nodes: FullNodeRow[] = [];
  const rebuild = (
    section: ColdSection,
  ): { content: string; plainText: string; wordCount: number } => {
    let content: ContentDoc;
    const parsed = contentSchema.safeParse(section.content);
    if (parsed.success) {
      content = parsed.data;
    } else {
      content = docFromPlainText(section.plainText);
      warnings.push(
        `Section "${section.title || section.displayTitle}": its formatting could not be read, so it was rebuilt from plain text.`,
      );
    }
    const plainText = docToPlainText(content);
    return { content: JSON.stringify(content), plainText, wordCount: countWords(plainText) };
  };
  const addSection = (
    section: ColdSection,
    parentId: string | null,
    position: number,
    deletedAt: string | null,
  ): void => {
    const text = rebuild(section);
    nodes.push({
      id: mapped(section.id),
      bookId,
      parentId,
      kind: section.kind,
      title: section.title,
      position,
      numbered: section.numbered,
      status: section.status,
      synopsis: section.synopsis,
      content: text.content,
      plainText: text.plainText,
      wordCount: text.wordCount,
      rev: section.rev,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      deletedAt,
    });
    section.children.forEach((child, i) => addSection(child, mapped(section.id), i, null));
  };
  doc.manuscript.forEach((s, i) => addSection(s, null, i, null));

  const subtreeIds = (section: ColdSection): Set<string> => {
    const set = new Set<string>();
    const visit = (s: ColdSection): void => {
      set.add(s.id);
      s.children.forEach(visit);
    };
    visit(section);
    return set;
  };
  doc.trash.forEach((entry, i) => {
    let parent: string | null = null;
    if (entry.originalParentId !== null) {
      if (ids.has(entry.originalParentId) && !subtreeIds(entry).has(entry.originalParentId)) {
        parent = mapped(entry.originalParentId);
      } else {
        warnings.push(
          `Trashed section "${entry.title}" lost its original parent and is restored to the book root.`,
        );
      }
    }
    addSection(entry, parent, i, entry.deletedAt);
  });
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const assets = doc.assets.flatMap((asset) => {
    const data = Buffer.from(asset.dataBase64, 'base64');
    const mime = sniffImage(data);
    if (!mime) {
      warnings.push(`Image "${asset.fileName}" is not a supported image type and was skipped.`);
      return [];
    }
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (sha256 !== asset.sha256) {
      warnings.push(`Image "${asset.fileName}" does not match its checksum; restored anyway.`);
    }
    return [
      {
        data,
        row: {
          id: mapped(asset.id),
          bookId,
          fileName: cleanFileName(asset.fileName),
          mime,
          bytes: data.length,
          sha256,
          createdAt: now.toISOString(),
        },
      },
    ];
  });
  const assetIdSet = new Set(assets.map((a) => a.row.id));
  let coverAssetId: string | null = null;
  if (doc.book.coverAssetId !== null) {
    const mappedCover = ids.get(doc.book.coverAssetId);
    if (mappedCover && assetIdSet.has(mappedCover)) coverAssetId = mappedCover;
    else warnings.push('The cover image was not available and was removed.');
  }

  const snapshots = (doc.snapshots ?? []).flatMap((s) => {
    const parsed = contentSchema.safeParse(s.content);
    if (!parsed.success || !nodeIdSet.has(mapped(s.nodeId))) {
      warnings.push('A snapshot could not be restored and was skipped.');
      return [];
    }
    return [
      {
        id: mapped(s.id),
        nodeId: mapped(s.nodeId),
        content: JSON.stringify(parsed.data),
        wordCount: countWords(docToPlainText(parsed.data)),
        reason: s.reason,
        createdAt: s.createdAt,
      },
    ];
  });

  const writtenFiles: string[] = [];
  try {
    for (const { data, row } of assets) {
      const file = assetFilePath(paths.assetsDir, row);
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      writeFileAtomic(file, data);
      writtenFiles.push(file);
    }
    db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      insertBookRow(db, {
        id: bookId,
        title: restoredTitle(db, doc.book.title, now),
        author: doc.book.author,
        description: doc.book.description,
        coverAssetId,
        settings: JSON.stringify(doc.book.settings),
        createdAt: doc.book.createdAt,
        updatedAt: doc.book.updatedAt,
      });
      for (const node of nodes) insertFullNodeRow(db, node);
      for (const { row } of assets) insertAsset(db, row);
      for (const snapshot of snapshots) insertSnapshot(db, snapshot);
      try {
        assertTreeInvariants(listNodes(db, bookId));
      } catch (err) {
        if (err instanceof TreeInvariantError)
          throw invalid(`The section tree is invalid: ${err.problems[0] ?? ''}`);
        throw err;
      }
    })();
  } catch (err) {
    for (const f of writtenFiles) fs.rmSync(f, { force: true });
    try {
      fs.rmdirSync(path.join(paths.assetsDir, bookId));
    } catch {
      // Missing or not empty (belongs to someone else); leave it.
    }
    throw err;
  }

  const book = getBook(db, bookId);
  if (!book) throw new ApiError(500, 'RESTORE_FAILED', 'The restored book could not be read back.');
  return { book, warnings, remapped };
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_FILE_PATTERN,
  backupFileName,
  bookFolderName,
  bookFolderSuffix,
  CHECKSUM_SUFFIX,
  COLD_BACKUP_README,
  computeStats,
} from '../../shared/cold-backup.ts';
import { computeDisplayTitles, UNTITLED } from '../../shared/numbering.ts';
import type {
  ColdBackupSettings,
  ColdBackupSettingsResponse,
  ExportAllResponse,
  ExportResult,
  PutColdBackupSettingsBody,
  ValidateLocationResponse,
  VerifyResult,
} from '../../shared/schemas/cold-backup-settings.ts';
import {
  COLD_BACKUP_FORMAT,
  COLD_BACKUP_VERSION,
  coldBackupSchema,
  type ColdAsset,
  type ColdBackupDoc,
  type ColdSection,
  type ColdTrashedSection,
} from '../../shared/schemas/cold-backup.ts';
import { readConfig, writeConfig, writeFileAtomic, type DataPaths } from '../config.ts';
import type { Db } from '../db/connection.ts';
import { getSchemaVersion } from '../db/migrate.ts';
import { ApiError } from '../errors.ts';
import { listBooks, parseSettingsObject, parseStructure } from '../repos/books.ts';
import {
  getBookExportRow,
  listBookAssets,
  listFullNodes,
  type FullNodeRow,
} from '../repos/cold-backup.ts';
import { listBookSnapshots } from '../repos/snapshots.ts';
import { assetFilePath } from './assets.ts';
import {
  assertLocationAllowed,
  checkLocation,
  defaultRepoRoot,
  LOCATION_INVALID,
  LOCATION_UNAVAILABLE,
  type LocationContext,
} from './cold-backup-location.ts';

export interface ColdBackupContext extends LocationContext {
  db: Db;
  paths: DataPaths;
  now?: () => Date;
}

export interface ExportOptions {
  dir?: string;
  includeSnapshots?: boolean;
}

function readAppVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const sha256Hex = (data: Uint8Array | string): string =>
  crypto.createHash('sha256').update(data).digest('hex');

const byPositionThenId = (a: FullNodeRow, b: FullNodeRow): number =>
  a.position - b.position || a.id.localeCompare(b.id);

/** Reads everything in one transaction and builds the validated document (COLD-03, COLD-04). */
export function buildColdBackup(
  ctx: ColdBackupContext,
  bookId: string,
  options: { includeSnapshots: boolean; now: Date },
): ColdBackupDoc {
  const { db, paths } = ctx;
  const loaded = db.transaction(() => {
    const book = getBookExportRow(db, bookId);
    if (!book) throw new ApiError(404, 'NOT_FOUND', 'Book not found.');
    return {
      book,
      nodes: listFullNodes(db, bookId),
      assets: listBookAssets(db, bookId),
      snapshots: options.includeSnapshots ? listBookSnapshots(db, bookId) : null,
      schemaVersion: getSchemaVersion(db),
    };
  })();

  const warnings: string[] = [];
  const structure = parseStructure(loaded.book.settings);
  const titles = computeDisplayTitles(loaded.nodes, structure);

  const childrenOf = new Map<string | null, FullNodeRow[]>();
  for (const node of loaded.nodes) {
    if (node.deletedAt !== null) continue;
    const list = childrenOf.get(node.parentId);
    if (list) list.push(node);
    else childrenOf.set(node.parentId, [node]);
  }
  let placed = 0;
  const toSection = (node: FullNodeRow): ColdSection => {
    placed += 1;
    const content = parseJsonObject(node.content);
    if (content === null) {
      warnings.push(`Section ${node.id}: its formatted text could not be read; plainText is kept.`);
    }
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      displayTitle: titles.get(node.id) ?? (node.title || UNTITLED),
      numbered: node.numbered,
      status: node.status,
      synopsis: node.synopsis,
      wordCount: node.wordCount,
      plainText: node.plainText,
      content,
      rev: node.rev,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      children: (childrenOf.get(node.id) ?? []).sort(byPositionThenId).map(toSection),
    };
  };

  const manuscript = (childrenOf.get(null) ?? []).sort(byPositionThenId).map(toSection);
  const trash: ColdTrashedSection[] = loaded.nodes
    .filter((n) => n.deletedAt !== null)
    .sort(
      (a, b) =>
        (a.deletedAt as string).localeCompare(b.deletedAt as string) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    )
    .map((node) => ({
      ...toSection(node),
      deletedAt: node.deletedAt as string,
      originalParentId: node.parentId,
    }));
  if (placed !== loaded.nodes.length) {
    warnings.push(`${loaded.nodes.length - placed} sections could not be placed in the tree.`);
  }

  const assets: ColdAsset[] = [];
  for (const asset of loaded.assets) {
    let data: Buffer;
    try {
      data = fs.readFileSync(assetFilePath(paths.assetsDir, asset));
    } catch {
      warnings.push(
        `Image ${asset.id} (${asset.fileName}) is missing on disk and was not included.`,
      );
      continue;
    }
    if (sha256Hex(data) !== asset.sha256) {
      warnings.push(
        `Image ${asset.id} (${asset.fileName}) does not match its checksum; included anyway.`,
      );
    }
    assets.push({
      id: asset.id,
      fileName: asset.fileName,
      mime: asset.mime,
      bytes: data.length,
      sha256: asset.sha256,
      dataBase64: data.toString('base64'),
    });
  }

  const snapshots =
    loaded.snapshots?.map((s) => ({
      id: s.id,
      nodeId: s.nodeId,
      content: parseJsonObject(s.content),
      wordCount: s.wordCount,
      reason: s.reason,
      createdAt: s.createdAt,
    })) ?? null;

  const partial = {
    manuscript,
    trash,
    codex: { categories: [], entries: [] },
    maps: [],
    foreshadows: [],
    assets,
    snapshots,
  };
  const doc: ColdBackupDoc = {
    _readme: COLD_BACKUP_README,
    format: COLD_BACKUP_FORMAT,
    formatVersion: COLD_BACKUP_VERSION,
    exportedAt: options.now.toISOString(),
    app: {
      name: 'NovelStudio',
      version: readAppVersion(ctx.repoRoot ?? defaultRepoRoot()),
      dbSchemaVersion: loaded.schemaVersion,
    },
    stats: computeStats(partial),
    warnings,
    book: {
      id: loaded.book.id,
      title: loaded.book.title,
      author: loaded.book.author,
      description: loaded.book.description,
      coverAssetId: loaded.book.coverAssetId,
      settings: parseSettingsObject(loaded.book.settings),
      createdAt: loaded.book.createdAt,
      updatedAt: loaded.book.updatedAt,
    },
    ...partial,
  };
  const checked = coldBackupSchema.safeParse(doc);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new ApiError(
      500,
      'BACKUP_INVALID',
      `The backup could not be built: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return doc;
}

/** Checks a written file: sidecar checksum, JSON, format, schema and that `stats` match the content. */
export function verifyColdBackup(file: string): VerifyResult {
  const problems: string[] = [];
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return {
      file,
      ok: false,
      checksum: 'missing',
      problems: ['The file could not be read.'],
      stats: null,
    };
  }

  let checksum: VerifyResult['checksum'] = 'missing';
  const sidecar = (() => {
    try {
      return fs.readFileSync(file + CHECKSUM_SUFFIX, 'utf8');
    } catch {
      return null;
    }
  })();
  if (sidecar !== null) {
    const expected = /^([0-9a-f]{64}) [ *](.+?)\s*$/i.exec(sidecar.trim());
    const matches =
      expected !== null &&
      expected[1]?.toLowerCase() === sha256Hex(bytes) &&
      expected[2] === path.basename(file);
    checksum = matches ? 'ok' : 'mismatch';
    if (!matches) problems.push('The file does not match its .sha256 checksum.');
  }

  let doc: ColdBackupDoc | null = null;
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    problems.push('The file is not valid JSON.');
  }
  if (json !== undefined) {
    const header = json as { format?: unknown; formatVersion?: unknown } | null;
    if (header?.format !== COLD_BACKUP_FORMAT) {
      problems.push('This is not a NovelStudio cold backup.');
    } else if (
      typeof header.formatVersion === 'number' &&
      header.formatVersion > COLD_BACKUP_VERSION
    ) {
      problems.push(
        `The file uses format version ${header.formatVersion}; this app supports up to ${COLD_BACKUP_VERSION}.`,
      );
    } else {
      const parsed = coldBackupSchema.safeParse(json);
      if (parsed.success) doc = parsed.data;
      else {
        const issue = parsed.error.issues[0];
        problems.push(
          `Invalid structure at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? ''}`,
        );
      }
    }
  }
  if (doc) {
    const actual = computeStats(doc);
    for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
      if (actual[key] !== doc.stats[key]) {
        problems.push(`stats.${key} says ${doc.stats[key]} but the file contains ${actual[key]}.`);
      }
    }
  }
  return { file, ok: problems.length === 0, checksum, problems, stats: doc?.stats ?? null };
}

function listBackupFiles(folder: string): string[] {
  const order = (name: string): [string, number] => {
    const m = /^(\d{4}-\d{2}-\d{2}_\d{6}Z)(?:-(\d+))?__/.exec(name);
    return [m?.[1] ?? name, Number(m?.[2] ?? 1)];
  };
  return fs
    .readdirSync(folder)
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .sort((a, b) => {
      const [sa, na] = order(a);
      const [sb, nb] = order(b);
      return sa === sb ? na - nb : sa < sb ? -1 : 1;
    });
}

/** Deletes the oldest files beyond `keep`, only among this book's own backups (COLD-06). */
function applyRetention(folder: string, keep: number, justWritten: string): void {
  const files = listBackupFiles(folder);
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    if (name === justWritten) continue;
    fs.rmSync(path.join(folder, name), { force: true });
    fs.rmSync(path.join(folder, name + CHECKSUM_SUFFIX), { force: true });
  }
}

function findBookFolder(base: string, bookId: string): string | null {
  const suffix = bookFolderSuffix(bookId);
  const match = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith(suffix))
    .map((e) => e.name)
    .sort()[0];
  return match ? path.join(base, match) : null;
}

export class ColdBackupService {
  constructor(private readonly ctx: ColdBackupContext) {}

  private now(): Date {
    return this.ctx.now ? this.ctx.now() : new Date();
  }

  settings(): ColdBackupSettingsResponse {
    const { coldBackup } = readConfig(this.ctx.paths.dataDir);
    return {
      settings: {
        dir: coldBackup.dir,
        keepNewestPerBook: coldBackup.keepNewestPerBook,
        includeSnapshots: coldBackup.includeSnapshots,
        reminderDays: coldBackup.reminderDays,
      },
      last: coldBackup.last,
      pickerSupported: process.platform === 'darwin',
    };
  }

  /** The folder may be unavailable right now (unplugged drive); only the policy is enforced here. */
  updateSettings(body: PutColdBackupSettingsBody): ColdBackupSettingsResponse {
    const config = readConfig(this.ctx.paths.dataDir);
    const next: ColdBackupSettings = { ...this.settings().settings };
    if (body.dir !== undefined)
      next.dir = body.dir === null ? null : assertLocationAllowed(body.dir, this.ctx);
    if (body.keepNewestPerBook !== undefined) next.keepNewestPerBook = body.keepNewestPerBook;
    if (body.includeSnapshots !== undefined) next.includeSnapshots = body.includeSnapshots;
    if (body.reminderDays !== undefined) next.reminderDays = body.reminderDays;
    writeConfig(this.ctx.paths.dataDir, {
      ...config,
      coldBackup: { ...config.coldBackup, ...next },
    });
    return this.settings();
  }

  validate(dir: string): ValidateLocationResponse {
    try {
      const location = checkLocation(dir, this.ctx);
      return {
        ok: true,
        willCreate: !location.exists,
        message: location.exists
          ? 'This folder is ready for cold backups.'
          : 'This folder does not exist yet and will be created on the first export.',
      };
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === LOCATION_UNAVAILABLE || err.code === LOCATION_INVALID)
      ) {
        return { ok: false, code: err.code, message: err.message, willCreate: false };
      }
      throw err;
    }
  }

  private resolveDir(oneOff: string | undefined): string {
    const dir = oneOff ?? this.settings().settings.dir;
    if (!dir) {
      throw new ApiError(
        400,
        'COLD_BACKUP_NOT_CONFIGURED',
        'Set a cold backup folder in Settings first, or choose a folder to export to.',
      );
    }
    return dir;
  }

  exportBook(bookId: string, options: ExportOptions = {}): ExportResult {
    const location = checkLocation(this.resolveDir(options.dir), this.ctx);
    return this.writeBook(bookId, location.dir, location.exists, options);
  }

  /** Live books only. The location is checked once up front, so an unavailable one writes nothing. */
  exportAll(options: ExportOptions = {}): ExportAllResponse {
    const location = checkLocation(this.resolveDir(options.dir), this.ctx);
    let exists = location.exists;
    const results: ExportAllResponse['results'] = [];
    for (const book of listBooks(this.ctx.db, { trashed: false, sort: 'title' })) {
      try {
        results.push({
          ok: true,
          bookId: book.id,
          title: book.title,
          result: this.writeBook(book.id, location.dir, exists, options),
        });
        exists = true;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError(500, 'EXPORT_FAILED', (err as Error).message);
        results.push({
          ok: false,
          bookId: book.id,
          title: book.title,
          error: { code: apiError.code, message: apiError.message },
        });
      }
    }
    return { results };
  }

  verifyLast(bookId?: string): (VerifyResult & { bookId: string })[] {
    const { last } = this.settings();
    return Object.entries(last)
      .filter(([id]) => bookId === undefined || id === bookId)
      .map(([id, entry]) => ({ bookId: id, ...verifyColdBackup(entry.file) }));
  }

  private writeBook(
    bookId: string,
    baseDir: string,
    baseExists: boolean,
    options: ExportOptions,
  ): ExportResult {
    const now = this.now();
    const config = readConfig(this.ctx.paths.dataDir).coldBackup;
    const doc = buildColdBackup(this.ctx, bookId, {
      includeSnapshots: options.includeSnapshots ?? config.includeSnapshots,
      now,
    });
    const bytes = Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8');
    const hash = sha256Hex(bytes);

    const createdDirs: string[] = [];
    const written: string[] = [];
    try {
      if (!baseExists && !fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { mode: 0o700 });
        createdDirs.push(baseDir);
      }
      let folder = findBookFolder(baseDir, bookId);
      if (!folder) {
        folder = path.join(baseDir, bookFolderName(doc.book.title, bookId));
        fs.mkdirSync(folder, { mode: 0o700 });
        createdDirs.push(folder);
      }

      let attempt = 1;
      let name = backupFileName(now, doc.book.title, attempt);
      while (
        fs.existsSync(path.join(folder, name)) ||
        fs.existsSync(path.join(folder, name + CHECKSUM_SUFFIX))
      ) {
        attempt += 1;
        name = backupFileName(now, doc.book.title, attempt);
      }
      const file = path.join(folder, name);
      const sidecar = file + CHECKSUM_SUFFIX;
      writeFileAtomic(file, bytes);
      written.push(file);
      writeFileAtomic(sidecar, `${hash}  ${name}\n`);
      written.push(sidecar);

      const verified = verifyColdBackup(file);
      const stats = verified.stats;
      if (
        !verified.ok ||
        verified.checksum !== 'ok' ||
        !stats ||
        JSON.stringify(stats) !== JSON.stringify(doc.stats)
      ) {
        throw new ApiError(
          500,
          'BACKUP_VERIFY_FAILED',
          `The backup was written but did not verify, so it was removed. ${verified.problems.join(' ')}`.trim(),
        );
      }

      const result: ExportResult = {
        bookId,
        title: doc.book.title,
        file,
        checksumFile: sidecar,
        bytes: bytes.length,
        sha256: hash,
        exportedAt: doc.exportedAt,
        stats: doc.stats,
        warnings: [...doc.warnings],
      };
      this.recordLast(bookId, now, file, result.warnings);
      if (config.keepNewestPerBook !== null) applyRetention(folder, config.keepNewestPerBook, name);
      return result;
    } catch (err) {
      for (const f of written) fs.rmSync(f, { force: true });
      for (const d of createdDirs.reverse()) {
        try {
          fs.rmdirSync(d);
        } catch {
          // Not empty or already gone; leave it.
        }
      }
      throw err;
    }
  }

  /** The backup itself already succeeded; a failure to remember it only costs the reminder badge. */
  private recordLast(bookId: string, at: Date, file: string, warnings: string[]): void {
    try {
      const config = readConfig(this.ctx.paths.dataDir);
      writeConfig(this.ctx.paths.dataDir, {
        ...config,
        coldBackup: {
          ...config.coldBackup,
          last: { ...config.coldBackup.last, [bookId]: { at: at.toISOString(), file } },
        },
      });
    } catch {
      warnings.push(
        'The backup was written, but the backup time could not be saved to config.json.',
      );
    }
  }
}

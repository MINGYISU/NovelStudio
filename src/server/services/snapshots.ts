import crypto from 'node:crypto';
import { docToPlainText } from '../../shared/prosemirror-text.ts';
import { contentSchema } from '../../shared/schemas/content.ts';
import type { NodeContent } from '../../shared/schemas/node.ts';
import {
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOTS_PER_NODE,
  type SnapshotReason,
  type SnapshotSummary,
} from '../../shared/schemas/snapshot.ts';
import { countWords } from '../../shared/wordcount.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import {
  getNodeContentRow,
  touchBook,
  writeNodeContent,
  type NodeContentRow,
} from '../repos/nodes.ts';
import {
  getSnapshot,
  insertSnapshot,
  listSnapshots,
  newestSnapshotAt,
  pruneSnapshots,
  type SnapshotRow,
} from '../repos/snapshots.ts';
import type { LibraryService } from './library.ts';

const EXCERPT_LENGTH = 160;

function plainTextOf(content: string): string {
  try {
    const parsed = contentSchema.safeParse(JSON.parse(content));
    return parsed.success ? docToPlainText(parsed.data) : '';
  } catch {
    return '';
  }
}

function summarize(row: SnapshotRow): SnapshotSummary {
  return {
    id: row.id,
    nodeId: row.nodeId,
    wordCount: row.wordCount,
    reason: row.reason,
    createdAt: row.createdAt,
    excerpt: plainTextOf(row.content).slice(0, EXCERPT_LENGTH),
  };
}

/** Section snapshots (SNAP-01, ED-10). Written inside the caller's transaction. */
export class SnapshotService {
  /** Sections already snapshotted since the server started; the first edit after start always snapshots. */
  private readonly seen = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
  ) {}

  /**
   * Called inside the save transaction with the text about to be overwritten. A snapshot is taken on
   * the first save since the server started, then at most every 10 minutes. Empty text is not worth
   * keeping. Call {@link markSeen} once the transaction has committed.
   */
  takeIfDue(previous: NodeContentRow, now: Date): SnapshotReason | null {
    if (previous.plainText.trim() === '') return null;
    let reason: SnapshotReason;
    if (!this.seen.has(previous.id)) {
      reason = 'open';
    } else {
      const newest = newestSnapshotAt(this.db, previous.id);
      const due = newest === null || now.getTime() - Date.parse(newest) >= SNAPSHOT_INTERVAL_MS;
      if (!due) return null;
      reason = 'interval';
    }
    this.insert(previous, reason, now);
    return reason;
  }

  markSeen(nodeId: string): void {
    this.seen.add(nodeId);
  }

  list(nodeId: string): SnapshotSummary[] {
    this.requireRow(nodeId);
    return listSnapshots(this.db, nodeId).map(summarize);
  }

  get(id: string): SnapshotSummary & { plainText: string } {
    const row = this.requireSnapshot(id);
    return { ...summarize(row), plainText: plainTextOf(row.content) };
  }

  /** Snapshots the current text first, so a restore can itself be undone. */
  restore(id: string): NodeContent {
    const now = new Date();
    const node = this.db.transaction(() => {
      const snapshot = this.requireSnapshot(id);
      const current = this.requireRow(snapshot.nodeId);
      this.library.requireLiveBook(current.bookId);
      if (current.deletedAt !== null) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');

      let doc;
      try {
        doc = contentSchema.parse(JSON.parse(snapshot.content));
      } catch {
        throw new ApiError(409, 'SNAPSHOT_INVALID', 'This snapshot cannot be restored.');
      }
      this.insert(current, 'before-restore', now);
      const plainText = docToPlainText(doc);
      const saved = writeNodeContent(
        this.db,
        current.id,
        current.rev,
        { content: JSON.stringify(doc), plainText, wordCount: countWords(plainText) },
        now.toISOString(),
      );
      if (!saved) throw new ApiError(409, 'STALE_REVISION', 'The section changed. Try again.');
      touchBook(this.db, current.bookId, now.toISOString());
      return {
        id: current.id,
        bookId: current.bookId,
        content: doc,
        rev: current.rev + 1,
        wordCount: countWords(plainText),
        updatedAt: now.toISOString(),
      };
    })();
    this.markSeen(node.id);
    return node;
  }

  private insert(row: NodeContentRow, reason: SnapshotReason, now: Date): void {
    insertSnapshot(this.db, {
      id: crypto.randomUUID(),
      nodeId: row.id,
      content: row.content,
      wordCount: row.wordCount,
      reason,
      createdAt: now.toISOString(),
    });
    pruneSnapshots(this.db, row.id, SNAPSHOTS_PER_NODE);
  }

  private requireRow(nodeId: string): NodeContentRow {
    const row = getNodeContentRow(this.db, nodeId);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
    return row;
  }

  private requireSnapshot(id: string): SnapshotRow {
    const row = getSnapshot(this.db, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Snapshot not found.');
    return row;
  }
}

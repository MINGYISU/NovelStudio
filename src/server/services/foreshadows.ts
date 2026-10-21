import crypto from 'node:crypto';
import { computeReadingOrder } from '../../shared/foreshadow.ts';
import {
  DEFAULT_THREAD_COLOR,
  type CreateOccurrenceBody,
  type CreateThreadBody,
  type PatchOccurrenceBody,
  type PatchThreadBody,
  type Thread,
} from '../../shared/schemas/foreshadow.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import {
  deleteOccurrenceRow,
  deleteThreadRow,
  getOccurrence,
  getThread,
  insertOccurrence,
  insertThread,
  listThreads,
  updateOccurrenceFields,
  updateThreadFields,
} from '../repos/foreshadows.ts';
import { listNodes, touchBook } from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';

export class ForeshadowService {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
  ) {}

  list(bookId: string): { threads: Thread[] } {
    this.library.requireBook(bookId);
    return { threads: listThreads(this.db, bookId) };
  }

  create(bookId: string, body: CreateThreadBody): { thread: Thread } {
    return this.db.transaction(() => {
      this.library.requireLiveBook(bookId);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      insertThread(this.db, {
        id,
        bookId,
        title: body.title,
        description: body.description ?? '',
        status: body.status ?? 'planned',
        color: body.color ?? DEFAULT_THREAD_COLOR,
        notes: body.notes ?? '',
        createdAt: now,
        updatedAt: now,
      });
      touchBook(this.db, bookId, now);
      return { thread: this.requireThread(id) };
    })();
  }

  update(id: string, patch: PatchThreadBody): { thread: Thread } {
    return this.db.transaction(() => {
      const thread = this.requireThread(id);
      this.library.requireLiveBook(thread.bookId);
      const now = new Date().toISOString();
      updateThreadFields(this.db, id, patch, now);
      touchBook(this.db, thread.bookId, now);
      return { thread: this.requireThread(id) };
    })();
  }

  delete(id: string): { threads: Thread[] } {
    return this.db.transaction(() => {
      const thread = this.requireThread(id);
      this.library.requireLiveBook(thread.bookId);
      deleteThreadRow(this.db, id);
      touchBook(this.db, thread.bookId, new Date().toISOString());
      return { threads: listThreads(this.db, thread.bookId) };
    })();
  }

  addOccurrence(threadId: string, body: CreateOccurrenceBody): { thread: Thread } {
    return this.db.transaction(() => {
      const thread = this.requireThread(threadId);
      this.library.requireLiveBook(thread.bookId);
      this.requireLiveSection(thread.bookId, body.nodeId);
      const now = new Date().toISOString();
      insertOccurrence(this.db, {
        id: crypto.randomUUID(),
        foreshadowId: threadId,
        nodeId: body.nodeId,
        role: body.role,
        excerpt: body.excerpt ?? '',
        note: body.note ?? '',
        anchored: false,
        anchorState: null,
        createdAt: now,
      });
      this.touch(thread, now);
      return { thread: this.requireThread(threadId) };
    })();
  }

  updateOccurrence(id: string, patch: PatchOccurrenceBody): { thread: Thread } {
    return this.db.transaction(() => {
      const occurrence = this.requireOccurrence(id);
      const thread = this.requireThread(occurrence.foreshadowId);
      this.library.requireLiveBook(thread.bookId);
      if (patch.nodeId !== undefined && patch.nodeId !== occurrence.nodeId) {
        this.requireLiveSection(thread.bookId, patch.nodeId);
      }
      updateOccurrenceFields(this.db, id, patch);
      this.touch(thread, new Date().toISOString());
      return { thread: this.requireThread(thread.id) };
    })();
  }

  deleteOccurrence(id: string): { thread: Thread } {
    return this.db.transaction(() => {
      const occurrence = this.requireOccurrence(id);
      const thread = this.requireThread(occurrence.foreshadowId);
      this.library.requireLiveBook(thread.bookId);
      deleteOccurrenceRow(this.db, id);
      this.touch(thread, new Date().toISOString());
      return { thread: this.requireThread(thread.id) };
    })();
  }

  private touch(thread: Thread, now: string): void {
    updateThreadFields(this.db, thread.id, {}, now);
    touchBook(this.db, thread.bookId, now);
  }

  /** An occurrence may only be placed in a section of the same book that is not in the trash. */
  private requireLiveSection(bookId: string, nodeId: string): void {
    const { positions } = computeReadingOrder(listNodes(this.db, bookId));
    if (!positions.has(nodeId)) {
      throw new ApiError(
        409,
        'INVALID_SECTION',
        'The section does not exist in this book or is in the trash.',
      );
    }
  }

  private requireThread(id: string): Thread {
    const thread = getThread(this.db, id);
    if (!thread) throw new ApiError(404, 'NOT_FOUND', 'Thread not found.');
    return thread;
  }

  private requireOccurrence(id: string) {
    const occurrence = getOccurrence(this.db, id);
    if (!occurrence) throw new ApiError(404, 'NOT_FOUND', 'Occurrence not found.');
    return occurrence;
  }
}

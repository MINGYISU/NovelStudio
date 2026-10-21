import { extractAnchorIds } from '../../shared/foreshadow-anchors.ts';
import { docToPlainText } from '../../shared/prosemirror-text.ts';
import { contentSchema } from '../../shared/schemas/content.ts';
import type {
  NodeContent,
  SaveContentBody,
  SaveContentResponse,
} from '../../shared/schemas/node.ts';
import { countWords } from '../../shared/wordcount.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { syncAnchors } from '../repos/foreshadows.ts';
import { getNodeContentRow, touchBook, writeNodeContent } from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';
import type { SnapshotService } from './snapshots.ts';

const STALE_MESSAGE = 'This section was changed elsewhere. Reload to see the newest text.';

/** Reading and saving section text (ED-01, ED-05, ED-07). */
export class ContentService {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
    private readonly snapshots: SnapshotService,
  ) {}

  get(id: string): NodeContent {
    const row = getNodeContentRow(this.db, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
    const parsed = (() => {
      try {
        return contentSchema.safeParse(JSON.parse(row.content));
      } catch {
        return null;
      }
    })();
    if (!parsed?.success) {
      throw new ApiError(500, 'CONTENT_INVALID', 'The stored text of this section is unreadable.');
    }
    return {
      id: row.id,
      bookId: row.bookId,
      content: parsed.data,
      rev: row.rev,
      wordCount: row.wordCount,
      updatedAt: row.updatedAt,
    };
  }

  /** The save succeeds only if `body.rev` is still current; otherwise 409 STALE_REVISION and nothing changes. */
  save(id: string, body: SaveContentBody): SaveContentResponse {
    const now = new Date();
    const result = this.db.transaction(() => {
      const row = getNodeContentRow(this.db, id);
      if (!row || row.deletedAt !== null)
        throw new ApiError(404, 'NOT_FOUND', 'Section not found.');
      this.library.requireLiveBook(row.bookId);
      if (row.rev !== body.rev) throw new ApiError(409, 'STALE_REVISION', STALE_MESSAGE);

      const content = JSON.stringify(body.content);
      if (content === row.content)
        return { rev: row.rev, wordCount: row.wordCount, snapshot: false };

      const plainText = docToPlainText(body.content);
      const wordCount = countWords(plainText);
      const snapshot = this.snapshots.takeIfDue(row, now) !== null;
      const written = writeNodeContent(
        this.db,
        id,
        body.rev,
        { content, plainText, wordCount },
        now.toISOString(),
      );
      if (!written) throw new ApiError(409, 'STALE_REVISION', STALE_MESSAGE);
      syncAnchors(this.db, row.bookId, id, extractAnchorIds(body.content));
      touchBook(this.db, row.bookId, now.toISOString());
      return { rev: body.rev + 1, wordCount, snapshot };
    })();
    if (result.snapshot) this.snapshots.markSeen(id);
    return { rev: result.rev, wordCount: result.wordCount };
  }
}

import { extractAnchorIds } from '../../shared/foreshadow-anchors.ts';
import { docToPlainText, findInDoc, replaceInDoc } from '../../shared/prosemirror-text.ts';
import { normalizeContent } from '../../shared/content-normalize.ts';
import { contentSchema, type ContentDoc } from '../../shared/schemas/content.ts';
import type {
  ReplaceBody,
  ReplaceResponse,
  SearchBody,
  SearchResponse,
} from '../../shared/schemas/search.ts';
import { countWords } from '../../shared/wordcount.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { syncAnchors } from '../repos/foreshadows.ts';
import {
  listLiveContentRows,
  touchBook,
  writeNodeContent,
  type NodeContentRow,
} from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';
import type { SnapshotService } from './snapshots.ts';

function parseContent(row: NodeContentRow): ContentDoc | null {
  try {
    const parsed = contentSchema.safeParse(normalizeContent(JSON.parse(row.content)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Find & replace across the live sections of one book (ED-09). */
export class SearchReplaceService {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
    private readonly snapshots: SnapshotService,
  ) {}

  /** Read-only, so it also works for a trashed book. */
  search(bookId: string, body: SearchBody): SearchResponse {
    this.library.requireBook(bookId);
    const caseSensitive = body.caseSensitive ?? false;
    const sections: SearchResponse['sections'] = [];
    let skipped = 0;
    let total = 0;
    for (const row of listLiveContentRows(this.db, bookId)) {
      const doc = parseContent(row);
      if (!doc) {
        skipped += 1;
        continue;
      }
      const found = findInDoc(doc, body.query, caseSensitive);
      if (found.count === 0) continue;
      total += found.count;
      sections.push({ nodeId: row.id, count: found.count, excerpts: found.excerpts });
    }
    return { total, sections, skipped };
  }

  /**
   * One transaction for the whole book: every affected section is snapshotted (`before-replace`)
   * and rewritten, or nothing changes. Only text inside single formatting runs is matched.
   */
  replace(bookId: string, body: ReplaceBody): ReplaceResponse {
    const now = new Date();
    const caseSensitive = body.caseSensitive ?? false;
    const only = body.nodeIds ? new Set(body.nodeIds) : null;

    const result = this.db.transaction((): ReplaceResponse => {
      this.library.requireLiveBook(bookId);
      const sections: ReplaceResponse['sections'] = [];
      let skipped = 0;
      let replaced = 0;

      for (const row of listLiveContentRows(this.db, bookId)) {
        if (only && !only.has(row.id)) continue;
        const doc = parseContent(row);
        if (!doc) {
          skipped += 1;
          continue;
        }
        const { doc: next, count } = replaceInDoc(doc, body.query, body.replacement, caseSensitive);
        if (count === 0) continue;

        const checked = contentSchema.safeParse(next);
        if (!checked.success) {
          throw new ApiError(
            400,
            'INVALID_REPLACEMENT',
            'The replacement would produce text the editor cannot store. Nothing was changed.',
          );
        }
        const plainText = docToPlainText(checked.data);
        const wordCount = countWords(plainText);
        this.snapshots.takeBeforeReplace(row, now);
        if (
          !writeNodeContent(
            this.db,
            row.id,
            row.rev,
            { content: JSON.stringify(checked.data), plainText, wordCount },
            now.toISOString(),
          )
        ) {
          throw new ApiError(409, 'STALE_REVISION', 'A section changed meanwhile. Try again.');
        }
        syncAnchors(this.db, bookId, row.id, extractAnchorIds(checked.data));
        sections.push({ nodeId: row.id, count, rev: row.rev + 1, wordCount });
        replaced += count;
      }
      if (sections.length > 0) touchBook(this.db, bookId, now.toISOString());
      return { replaced, sections, skipped };
    })();

    for (const s of result.sections) this.snapshots.markSeen(s.nodeId);
    return result;
  }
}

import crypto from 'node:crypto';
import {
  decodeImportText,
  ImportError,
  splitImport,
  type ImportPlan,
} from '../../shared/import-split.ts';
import type {
  ImportPreviewResponse,
  ImportTextCommitResponse,
} from '../../shared/schemas/import.ts';
import { CHINESE_STRUCTURE, DEFAULT_STRUCTURE } from '../../shared/schemas/structure.ts';
import { assertTreeInvariants } from '../../shared/tree.ts';
import type { TreeNode } from '../../shared/types.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import { getBook, insertBook, updateBookFields } from '../repos/books.ts';
import { insertDefaultCategories } from '../repos/codex.ts';
import { insertNodeRow, listNodes, setNodeText } from '../repos/nodes.ts';

const EXCERPT_CHARS = 120;
const DEFAULT_BOOK_TITLE = 'Imported book';

export interface TextImportInput {
  bytes: Uint8Array;
  fileName: string;
  detect: boolean;
  title?: string;
  preset?: 'english' | 'chinese';
}

function baseName(fileName: string): string {
  const name = fileName.replace(/^.*[\\/]/, '');
  return name.replace(/\.[^.]*$/, '').trim();
}

function isMarkdownName(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

function plan(input: TextImportInput): { plan: ImportPlan; encoding: string; title: string } {
  const title = (input.title || baseName(input.fileName) || DEFAULT_BOOK_TITLE).slice(0, 200);
  try {
    const { text, encoding } = decodeImportText(input.bytes);
    const result = splitImport(text, {
      markdown: isMarkdownName(input.fileName),
      detect: input.detect,
      fallbackTitle: title,
    });
    if (result.sections.length === 0) {
      throw new ApiError(400, 'IMPORT_EMPTY', 'The file contains no text.');
    }
    return { plan: result, encoding, title };
  } catch (err) {
    if (err instanceof ImportError) {
      const status = err.code === 'TOO_MANY_SECTIONS' ? 400 : 415;
      throw new ApiError(status, `IMPORT_${err.code}`, err.message);
    }
    throw err;
  }
}

/** IMP-02: proposes the structure; writes nothing. */
export function previewTextImport(input: TextImportInput): ImportPreviewResponse {
  const { plan: result, encoding } = plan(input);
  return {
    encoding,
    detected: result.detected,
    suggestedPreset: result.suggestedPreset,
    totalWords: result.sections.reduce((sum, s) => sum + s.wordCount, 0),
    sections: result.sections.map((s) => ({
      kind: s.kind,
      title: s.title,
      parentIndex: s.parentIndex,
      unnumbered: s.unnumbered,
      wordCount: s.wordCount,
      excerpt: s.plainText.slice(0, EXCERPT_CHARS),
    })),
    warnings: result.warnings,
  };
}

/** IMP-02/03: one transaction creates the book and every section, or nothing at all. */
export function commitTextImport(db: Db, input: TextImportInput): ImportTextCommitResponse {
  const { plan: result, title } = plan(input);
  const preset = input.preset ?? result.suggestedPreset;
  const structure = preset === 'chinese' ? CHINESE_STRUCTURE : DEFAULT_STRUCTURE;
  const now = new Date().toISOString();

  const bookId = db.transaction(() => {
    const created = insertBook(db, { title }, now);
    insertDefaultCategories(db, created.id);
    if (preset === 'chinese') updateBookFields(db, created.id, { structure }, now);

    const ids = result.sections.map(() => crypto.randomUUID());
    const nextPosition = new Map<string | null, number>();
    result.sections.forEach((section, i) => {
      const parentId = section.parentIndex === null ? null : (ids[section.parentIndex] ?? null);
      const position = nextPosition.get(parentId) ?? 0;
      nextPosition.set(parentId, position + 1);
      const node: TreeNode = {
        id: ids[i] as string,
        bookId: created.id,
        parentId,
        kind: section.kind,
        title: section.title,
        position,
        numbered: !section.unnumbered && structure[section.kind].defaultNumbered,
        status: 'draft',
        synopsis: '',
        wordCount: section.wordCount,
        deletedAt: null,
      };
      insertNodeRow(db, node, now);
      setNodeText(db, node.id, {
        content: JSON.stringify(section.content),
        plainText: section.plainText,
        wordCount: section.wordCount,
      });
    });
    assertTreeInvariants(listNodes(db, created.id));
    return created.id;
  })();

  const saved = getBook(db, bookId);
  if (!saved) throw new ApiError(500, 'IMPORT_FAILED', 'The imported book could not be read back.');
  return { book: saved, sectionCount: result.sections.length, warnings: result.warnings };
}

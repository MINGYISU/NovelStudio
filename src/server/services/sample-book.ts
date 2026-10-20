import { CHINESE_STRUCTURE } from '../../shared/schemas/structure.ts';
import { countWords } from '../../shared/wordcount.ts';
import type { Db } from '../db/connection.ts';
import { listBooks } from '../repos/books.ts';
import { setNodeText } from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';
import type { ManuscriptService } from './manuscript.ts';

export const SAMPLE_BOOK_TITLE = 'Sample Novel (dev seed)';
export const SAMPLE_CN_BOOK_TITLE = '示例小说（开发数据）';

const WORDS = [
  'harbor',
  'lantern',
  'winter',
  'ledger',
  'orchard',
  'signal',
  'copper',
  'river',
  'quiet',
  'letter',
  'storm',
  'garden',
];

function paragraph(seed: number, words: number): string {
  return Array.from({ length: words }, (_, i) => WORDS[(seed * 7 + i * 3) % WORDS.length]).join(
    ' ',
  );
}

/** Made-up text only. */
function writeText(db: Db, id: string, text: string): void {
  setNodeText(db, id, {
    content: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }),
    plainText: text,
    wordCount: countWords(text),
  });
}

/**
 * Builds the sample books for development: 3 volumes x 3 parts x 5 chapters x 3 scenes plus a
 * prologue and an epilogue (about 190 sections), and a small Chinese-structured book.
 * Does nothing when a sample book already exists.
 */
export function seedSampleBooks(
  db: Db,
  library: LibraryService,
  manuscript: ManuscriptService,
): { created: boolean } {
  const exists = [false, true].some((trashed) =>
    listBooks(db, { trashed, sort: 'title' }).some((b) => b.title === SAMPLE_BOOK_TITLE),
  );
  if (exists) return { created: false };

  const book = library.create({ title: SAMPLE_BOOK_TITLE, author: 'Dev Seed' });
  const add = (
    kind: 'volume' | 'part' | 'chapter' | 'scene',
    parentId: string | null,
    title: string,
    numbered?: boolean,
  ) => manuscript.create(book.id, { kind, parentId, title, numbered }).node;

  const prologue = add('chapter', null, 'Prologue', false);
  writeText(db, prologue.id, paragraph(1, 120));
  let seed = 2;
  for (let v = 1; v <= 3; v++) {
    const volume = add('volume', null, `The ${WORDS[v]} years`);
    for (let p = 1; p <= 3; p++) {
      const part = add('part', volume.id, `${WORDS[p + 3]} season`);
      for (let c = 1; c <= 5; c++) {
        const chapter = add('chapter', part.id, c % 2 ? `The ${WORDS[c + 5]}` : '');
        writeText(db, chapter.id, paragraph(seed++, 200 + c * 40));
        for (let s = 1; s <= 3; s++) {
          const scene = add('scene', chapter.id, s === 1 ? '' : `Scene ${WORDS[s]}`);
          writeText(db, scene.id, paragraph(seed++, 80 + s * 25));
        }
      }
    }
  }
  const epilogue = add('chapter', null, 'Epilogue', false);
  writeText(db, epilogue.id, paragraph(seed, 150));

  const cn = library.create({ title: SAMPLE_CN_BOOK_TITLE, author: '开发数据' });
  library.update(cn.id, { structure: CHINESE_STRUCTURE });
  for (let c = 1; c <= 6; c++) {
    const chapter = manuscript.create(cn.id, {
      kind: 'chapter',
      parentId: null,
      title: c === 1 ? '夜雨' : '',
    }).node;
    writeText(db, chapter.id, paragraph(c, 90));
  }
  return { created: true };
}

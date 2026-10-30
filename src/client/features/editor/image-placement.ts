import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { ImageSize } from '../../../shared/schemas/content.ts';

export interface NewImage {
  assetId: string;
  size?: ImageSize;
  caption?: string;
}

/**
 * Builds the transaction that inserts an image so that it always sits on a line of its own (IMG-01,
 * IMG-02): inside a paragraph or heading the text is split there; at its start or end the image
 * goes before or after it; an empty paragraph is replaced; inside a quote the image goes after the
 * quote. `at` is a document position (a drop point); the default is the end of the selection.
 */
export function insertImageTransaction(
  state: EditorState,
  image: NewImage,
  at?: number,
): Transaction {
  const { image: imageType, paragraph } = state.schema.nodes;
  if (!imageType || !paragraph) throw new Error('The schema has no image node.');
  const node = imageType.create({ size: 'medium', caption: '', ...image });
  const pos = at ?? state.selection.to;
  const $pos = state.doc.resolve(pos);
  const tr = state.tr;

  let insertAt: number;
  if ($pos.depth === 0) {
    insertAt = pos;
    tr.insert(insertAt, node);
  } else if ($pos.depth === 1 && $pos.parent.isTextblock) {
    const block = $pos.parent;
    if (block.content.size === 0) {
      insertAt = $pos.before(1);
      tr.replaceWith(insertAt, $pos.after(1), node);
    } else if ($pos.parentOffset === 0) {
      insertAt = $pos.before(1);
      tr.insert(insertAt, node);
    } else if ($pos.parentOffset === block.content.size) {
      insertAt = $pos.after(1);
      tr.insert(insertAt, node);
    } else {
      tr.split(pos);
      insertAt = tr.mapping.map(pos, -1) + 1;
      tr.insert(insertAt, node);
    }
  } else {
    insertAt = $pos.after(1);
    tr.insert(insertAt, node);
  }

  // Something to type in after a final image.
  if (insertAt + node.nodeSize === tr.doc.content.size) {
    tr.insert(tr.doc.content.size, paragraph.create());
  }
  return tr.setSelection(NodeSelection.create(tr.doc, insertAt)).scrollIntoView();
}

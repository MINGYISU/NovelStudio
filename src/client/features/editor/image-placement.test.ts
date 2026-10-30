import { Schema, type Node } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { insertImageTransaction } from './image-placement.ts';

const schema = new Schema({
  nodes: {
    doc: { content: '(block | topImage)+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    heading: { group: 'block', content: 'text*', toDOM: () => ['h1', 0] },
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    text: { group: 'inline' },
    image: {
      group: 'topImage',
      atom: true,
      attrs: { assetId: {}, size: { default: 'medium' }, caption: { default: '' } },
      toDOM: () => ['figure'],
    },
  },
});

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : []);
const quote = (...children: Node[]) => schema.node('blockquote', null, children);
const ID = '11111111-1111-4111-8111-111111111111';

/** `[type or text]` per top-level block, so the layout is easy to read in assertions. */
function layout(doc: Node): string[] {
  const out: string[] = [];
  doc.forEach((n) => out.push(n.type.name === 'paragraph' ? n.textContent : n.type.name));
  return out;
}

function stateAt(doc: Node, cursor: number): EditorState {
  const state = EditorState.create({ schema, doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, cursor)));
}

const insert = (state: EditorState, at?: number) =>
  state.apply(insertImageTransaction(state, { assetId: ID }, at));

describe('insertImageTransaction', () => {
  it('splits a paragraph in the middle so the image is on its own line', () => {
    const doc = schema.node('doc', null, [p('HelloWorld'), p('End')]);
    const next = insert(stateAt(doc, 1 + 5));
    expect(layout(next.doc)).toEqual(['Hello', 'image', 'World', 'End']);
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect(next.selection.from).toBe(next.doc.child(0).nodeSize);
  });

  it('puts the image before a paragraph when the cursor is at its start, after it at its end', () => {
    const doc = schema.node('doc', null, [p('One'), p('Two')]);
    expect(layout(insert(stateAt(doc, 1)).doc)).toEqual(['image', 'One', 'Two']);
    expect(layout(insert(stateAt(doc, 4)).doc)).toEqual(['One', 'image', 'Two']);
  });

  it('replaces an empty paragraph', () => {
    const doc = schema.node('doc', null, [p('One'), p(''), p('Two')]);
    expect(layout(insert(stateAt(doc, 6)).doc)).toEqual(['One', 'image', 'Two']);
  });

  it('always leaves a paragraph after a final image', () => {
    const doc = schema.node('doc', null, [p('One')]);
    expect(layout(insert(stateAt(doc, 4)).doc)).toEqual(['One', 'image', '']);
    const only = schema.node('doc', null, [p('')]);
    expect(layout(insert(stateAt(only, 1)).doc)).toEqual(['image', '']);
  });

  it('puts the image after the quote when the cursor is inside one', () => {
    const doc = schema.node('doc', null, [quote(p('Quoted'), p('More')), p('End')]);
    const next = insert(stateAt(doc, 4));
    expect(layout(next.doc)).toEqual(['blockquote', 'image', 'End']);
    expect(next.doc.child(0).childCount).toBe(2);
  });

  it('inserts at a drop position and between blocks', () => {
    const doc = schema.node('doc', null, [p('One'), p('Two')]);
    const state = EditorState.create({ schema, doc });
    expect(layout(insert(state, 7).doc)).toEqual(['One', 'T', 'image', 'wo']);
    expect(layout(insert(state, 5).doc)).toEqual(['One', 'image', 'Two']);
    expect(layout(insert(state, 0).doc)).toEqual(['image', 'One', 'Two']);
  });

  it('inserts after a selected image and keeps size and caption options', () => {
    const doc = schema.node('doc', null, [
      p('One'),
      schema.node('image', { assetId: ID }),
      p('Two'),
    ]);
    const state = EditorState.create({ schema, doc });
    const selected = state.apply(state.tr.setSelection(NodeSelection.create(doc, 5)));
    const next = selected.apply(
      insertImageTransaction(selected, { assetId: ID, size: 'small', caption: 'Hi' }),
    );
    expect(layout(next.doc)).toEqual(['One', 'image', 'image', 'Two']);
    expect(next.doc.child(2).attrs).toEqual({ assetId: ID, size: 'small', caption: 'Hi' });
  });
});

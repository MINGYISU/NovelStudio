import { Extension } from '@tiptap/react';
import { Plugin, type EditorState, type Transaction } from '@tiptap/pm/state';

const QUOTE_INPUT = /^\s*>\s$/;

function insideQuote(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'blockquote') return true;
  }
  return false;
}

/** Positions of quotes inside another quote, last first, so unwrapping one keeps the others' positions. */
function nestedQuotes(state: EditorState): number[] {
  const found: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'blockquote' && insideQuote(state, pos)) found.push(pos);
    return true;
  });
  return found.reverse();
}

/**
 * Blockquotes never nest (ED-02, mirrors `normalizeContent`): typing `> ` inside a quote stays
 * plain text, and any nested quote that still appears (drag and drop, a command) is unwrapped into
 * its outer quote. Runs before the blockquote input rule because of its higher priority.
 */
export const NoNestedQuotes = Extension.create({
  name: 'noNestedQuotes',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            if (!insideQuote(state, from)) return false;
            const $from = state.doc.resolve(from);
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
            if (!QUOTE_INPUT.test(before + text)) return false;
            view.dispatch(state.tr.insertText(text, from, to));
            return true;
          },
        },
        appendTransaction(transactions, _oldState, newState): Transaction | null {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const nested = nestedQuotes(newState);
          if (nested.length === 0) return null;
          const tr = newState.tr;
          for (const pos of nested) {
            const node = tr.doc.nodeAt(pos);
            if (node) tr.replaceWith(pos, pos + node.nodeSize, node.content);
          }
          return tr;
        },
      }),
    ];
  },
});

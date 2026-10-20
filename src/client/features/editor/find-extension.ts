import { Extension, type Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** Index of the highlighted match, or -1 when there are none. */
  current: number;
}

const findKey = new PluginKey<FindState>('find');
const EMPTY: FindState = { query: '', caseSensitive: false, matches: [], current: -1 };

type FindMeta =
  { type: 'query'; query: string; caseSensitive: boolean } | { type: 'step'; direction: 1 | -1 };

/** Matches inside one text block, so they never span paragraphs (formatting boundaries are fine). */
export function findMatches(doc: PmNode, query: string, caseSensitive: boolean): FindMatch[] {
  if (query === '') return [];
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    caseSensitive ? 'gu' : 'giu',
  );
  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Hard breaks become one placeholder character so offsets stay aligned with document positions.
    const text = node.textBetween(0, node.content.size, undefined, '\uFFFC');
    for (const m of text.matchAll(pattern)) {
      const from = pos + 1 + (m.index ?? 0);
      matches.push({ from, to: from + m[0].length });
    }
    return false;
  });
  return matches;
}

/** Find in section (ED-08): decorations only, so the document and its saves are never touched. */
export const FindExtension = Extension.create({
  name: 'find',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as FindMeta | undefined;
            if (meta?.type === 'query') {
              const matches = findMatches(tr.doc, meta.query, meta.caseSensitive);
              return {
                query: meta.query,
                caseSensitive: meta.caseSensitive,
                matches,
                current: matches.length > 0 ? 0 : -1,
              };
            }
            if (meta?.type === 'step' && prev.matches.length > 0) {
              const n = prev.matches.length;
              return { ...prev, current: (prev.current + meta.direction + n) % n };
            }
            if (tr.docChanged && prev.query !== '') {
              const matches = findMatches(tr.doc, prev.query, prev.caseSensitive);
              return {
                ...prev,
                matches,
                current:
                  matches.length === 0
                    ? -1
                    : Math.min(Math.max(prev.current, 0), matches.length - 1),
              };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const find = findKey.getState(state);
            if (!find || find.matches.length === 0) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              find.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === find.current ? 'find-match find-current' : 'find-match',
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

export function getFindState(editor: Editor): FindState {
  return findKey.getState(editor.state) ?? EMPTY;
}

function dispatchMeta(editor: Editor, meta: FindMeta): void {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, meta));
}

function scrollToCurrent(editor: Editor): void {
  const { matches, current } = getFindState(editor);
  const match = matches[current];
  if (!match) return;
  const { node } = editor.view.domAtPos(match.from);
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  el?.scrollIntoView({ block: 'center' });
}

export function setFindQuery(editor: Editor, query: string, caseSensitive: boolean): void {
  dispatchMeta(editor, { type: 'query', query, caseSensitive });
  scrollToCurrent(editor);
}

export function stepFind(editor: Editor, direction: 1 | -1): void {
  dispatchMeta(editor, { type: 'step', direction });
  scrollToCurrent(editor);
}

export function clearFind(editor: Editor): void {
  dispatchMeta(editor, { type: 'query', query: '', caseSensitive: false });
}

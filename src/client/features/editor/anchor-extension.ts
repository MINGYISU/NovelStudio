import { Mark, mergeAttributes } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  ANCHOR_ATTRIBUTE,
  ANCHOR_MARK,
  isOccurrenceId,
} from '../../../shared/foreshadow-anchors.ts';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Occurrence id → thread color; read on every render of the text, so it can change under the editor. */
export class AnchorColors {
  private colors: ReadonlyMap<string, string> = new Map();

  get(occurrenceId: string): string | undefined {
    return this.colors.get(occurrenceId);
  }

  replace(colors: ReadonlyMap<string, string>): void {
    this.colors = colors;
  }
}

export const anchorColorsKey = new PluginKey('foreshadowAnchorColors');

/**
 * FS-08: marks text as the place of one occurrence. The mark is stored in the section's content, so
 * it moves with the text when that text is cut and pasted. Anchors can overlap, and typing at the
 * edge of an anchor does not extend it.
 */
export function createForeshadowAnchor(colors: AnchorColors) {
  return Mark.create({
    name: ANCHOR_MARK,
    inclusive: false,
    excludes: '',

    addAttributes() {
      return {
        occurrenceId: {
          default: null,
          parseHTML: (el) => el.getAttribute(ANCHOR_ATTRIBUTE),
          renderHTML: (attrs) =>
            typeof attrs.occurrenceId === 'string'
              ? { [ANCHOR_ATTRIBUTE]: attrs.occurrenceId }
              : {},
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: `span[${ANCHOR_ATTRIBUTE}]`,
          getAttrs: (el) => (isOccurrenceId(el.getAttribute(ANCHOR_ATTRIBUTE)) ? null : false),
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes), 0];
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: anchorColorsKey,
          props: {
            decorations: (state) => {
              const found: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText) return;
                for (const mark of node.marks) {
                  if (mark.type.name !== ANCHOR_MARK) continue;
                  const color = colors.get(String(mark.attrs.occurrenceId));
                  if (color !== undefined && HEX.test(color)) {
                    found.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: 'foreshadow-anchor-text',
                        style: `--anchor-color: ${color}`,
                      }),
                    );
                  }
                }
              });
              return DecorationSet.create(state.doc, found);
            },
          },
        }),
      ];
    },
  });
}

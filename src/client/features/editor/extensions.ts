import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { createForeshadowAnchor, type AnchorColors } from './anchor-extension.ts';
import { FindExtension } from './find-extension.ts';

/** Exactly the formatting of ED-02: nothing else can be typed, pasted or stored. */
export function createExtensions(anchorColors: AnchorColors) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2] },
      bold: {},
      italic: {},
      strike: {},
      underline: {},
      blockquote: {},
      horizontalRule: {},
      hardBreak: {},
      undoRedo: {},
      code: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      link: false,
      trailingNode: false,
    }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
    FindExtension,
    createForeshadowAnchor(anchorColors),
  ];
}

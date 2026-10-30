import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { t } from '../../i18n/index.ts';
import { createForeshadowAnchor, type AnchorColors } from './anchor-extension.ts';
import { FindExtension } from './find-extension.ts';
import { createImageExtension, ImageDocument, type ImageHost } from './image-extension.ts';
import { NoNestedQuotes } from './no-nested-quotes.ts';

/** Exactly the formatting of ED-02: nothing else can be typed, pasted or stored. */
export function createExtensions(anchorColors: AnchorColors, imageHost: ImageHost) {
  return [
    StarterKit.configure({
      // Replaced by ImageDocument, which also allows images at the top level.
      document: false,
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
    // Read lazily, so a language change shows on the next view update without recreating the editor.
    Placeholder.configure({ placeholder: () => t('editor.placeholder') }),
    FindExtension,
    NoNestedQuotes,
    createForeshadowAnchor(anchorColors),
    ImageDocument,
    createImageExtension(imageHost),
  ];
}

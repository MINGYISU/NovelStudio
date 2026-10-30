import {
  mergeAttributes,
  Node,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { Plugin, PluginKey, type NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createElement } from 'react';
import { IMAGE_SIZES, type ImageSize } from '../../../shared/schemas/content.ts';
import { copyBookImage } from '../../api/assets.ts';
import { apiErrorMessage, t } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { ImageNodeView } from './ImageNodeView.tsx';
import { insertImageTransaction, type NewImage } from './image-placement.ts';
import { uploadImageFile } from './image-upload.ts';

/** What the open section's editor panel provides to the image node: the book and its dialogs. */
export class ImageHost {
  pick: (mode: 'insert' | 'replace', onPick: (asset: { id: string }) => void) => void = () => {};
  zoom: (image: { url: string; caption: string }) => void = () => {};

  constructor(readonly bookId: string) {}

  /** Connects the dialogs of the editor panel; called again whenever they change. */
  connect(handlers: { pick: ImageHost['pick']; zoom: ImageHost['zoom'] }): void {
    this.pick = handlers.pick;
    this.zoom = handlers.zoom;
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /** Inserts an image on a line of its own at the cursor, or at the document position `at`. */
      insertImage: (image: NewImage, at?: number) => ReturnType;
    };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The document root: images are allowed here and, being outside `block`, nowhere else (IMG-02). */
export const ImageDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | topImage)+',
});

/** Positions of uploads in progress, kept in step with the edits made meanwhile (A3). */
const pendingKey = new PluginKey<ReadonlyMap<number, number>>('imageUploads');

interface PendingMeta {
  set?: [token: number, pos: number];
  remove?: number;
}

let uploadCounter = 0;

function notifyError(message: string): void {
  useWorkspaceStore.getState().notify({ tone: 'error', message });
}

async function addImageFiles(
  view: EditorView,
  host: ImageHost,
  files: readonly File[],
  pos: number,
): Promise<void> {
  const token = ++uploadCounter;
  const uploading = t('images.notice.uploading');
  view.dispatch(view.state.tr.setMeta(pendingKey, { set: [token, pos] } satisfies PendingMeta));
  useWorkspaceStore.getState().notify({ tone: 'info', message: uploading });
  try {
    for (const file of files) {
      const asset = await uploadImageFile(host.bookId, file);
      if (view.isDestroyed) return;
      const at = pendingKey.getState(view.state)?.get(token);
      if (at === undefined) return;
      const tr = insertImageTransaction(view.state, { assetId: asset.id }, at);
      // The next file goes right after this image.
      tr.setMeta(pendingKey, {
        set: [token, (tr.selection as NodeSelection).to],
      } satisfies PendingMeta);
      view.dispatch(tr);
    }
    const store = useWorkspaceStore.getState();
    if (store.notice?.message === uploading) store.dismissNotice();
  } catch (error) {
    notifyError(t('images.notice.uploadFailed', { message: apiErrorMessage(error) }));
  } finally {
    if (!view.isDestroyed) {
      view.dispatch(view.state.tr.setMeta(pendingKey, { remove: token } satisfies PendingMeta));
    }
  }
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

/**
 * Images pasted from another book (IMG-10) carry that book's id. Their files are copied into this
 * book first and the clipboard HTML is rewritten to point at the copies; one that cannot be copied
 * is left out with a notice.
 */
async function pasteForeignImages(
  view: EditorView,
  host: ImageHost,
  doc: Document,
  foreign: Element[],
): Promise<void> {
  const copies = new Map<string, Promise<string | null>>();
  let failure: unknown = null;
  for (const figure of foreign) {
    const sourceBook = figure.getAttribute('data-book-id') ?? '';
    const assetId = figure.getAttribute('data-asset-id') ?? '';
    const key = `${sourceBook}/${assetId}`;
    if (!copies.has(key)) {
      copies.set(
        key,
        copyBookImage(host.bookId, sourceBook, assetId).then(
          (asset) => asset.id,
          (error: unknown) => {
            failure = error;
            return null;
          },
        ),
      );
    }
    const copied = await copies.get(key);
    if (copied === null || copied === undefined) figure.remove();
    else {
      figure.setAttribute('data-asset-id', copied);
      figure.setAttribute('data-book-id', host.bookId);
    }
  }
  if (failure !== null) {
    notifyError(t('images.notice.copyFailed', { message: apiErrorMessage(failure) }));
  }
  if (!view.isDestroyed) view.pasteHTML(doc.body.innerHTML);
}

function foreignFigures(
  html: string,
  bookId: string,
): { doc: Document; figures: Element[] } | null {
  if (!html.includes('data-ns-image')) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const figures = Array.from(doc.querySelectorAll('figure[data-ns-image]')).filter((figure) => {
    const source = figure.getAttribute('data-book-id');
    return source !== null && UUID.test(source) && source !== bookId;
  });
  return figures.length > 0 ? { doc, figures } : null;
}

/** IMG-01..05, IMG-09, IMG-10, IMG-13: the `image` node, its view, and pasting and dropping of files. */
export function createImageExtension(host: ImageHost) {
  const View = (props: ReactNodeViewProps) => createElement(ImageNodeView, { ...props, host });

  return Node.create({
    name: 'image',
    group: 'topImage',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        assetId: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-asset-id'),
          renderHTML: (attrs) => ({ 'data-asset-id': attrs.assetId as string }),
        },
        size: {
          default: 'medium',
          parseHTML: (el) => {
            const size = el.getAttribute('data-size');
            return (IMAGE_SIZES as readonly (string | null)[]).includes(size) ? size : 'medium';
          },
          renderHTML: (attrs) => ({ 'data-size': attrs.size as ImageSize }),
        },
        caption: {
          default: '',
          parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '',
          renderHTML: () => ({}),
        },
      };
    },

    // Only our own clipboard form is accepted; foreign `<img>` never becomes an image (IMG-09).
    parseHTML() {
      return [
        {
          tag: 'figure[data-ns-image]',
          getAttrs: (el) => (UUID.test(el.getAttribute('data-asset-id') ?? '') ? null : false),
        },
      ];
    },

    renderHTML({ node, HTMLAttributes }) {
      const caption = typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
      return [
        'figure',
        mergeAttributes({ 'data-ns-image': '', 'data-book-id': host.bookId }, HTMLAttributes),
        ...(caption ? [['figcaption', {}, caption] as const] : []),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(View);
    },

    addCommands() {
      return {
        insertImage:
          (image, at) =>
          ({ state, dispatch }) => {
            if (dispatch) dispatch(insertImageTransaction(state, image, at));
            return true;
          },
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pendingKey,
          state: {
            init: (): ReadonlyMap<number, number> => new Map(),
            apply(tr, value) {
              const meta = tr.getMeta(pendingKey) as PendingMeta | undefined;
              if (!tr.docChanged && !meta) return value;
              const next = new Map<number, number>();
              for (const [token, pos] of value) next.set(token, tr.mapping.map(pos));
              if (meta?.set) next.set(...meta.set);
              if (meta?.remove !== undefined) next.delete(meta.remove);
              return next;
            },
          },
          props: {
            handlePaste(view, event) {
              if (!view.editable) return false;
              const files = imageFiles(event.clipboardData?.files);
              if (files.length > 0) {
                event.preventDefault();
                void addImageFiles(view, host, files, view.state.selection.to);
                return true;
              }
              const foreign = foreignFigures(
                event.clipboardData?.getData('text/html') ?? '',
                host.bookId,
              );
              if (!foreign) return false;
              event.preventDefault();
              void pasteForeignImages(view, host, foreign.doc, foreign.figures);
              return true;
            },
            handleDrop(view, event) {
              console.log(
                'EVT handleDrop dragging=' +
                  String(!!view.dragging) +
                  ' files=' +
                  String(event.dataTransfer?.files.length) +
                  ' types=' +
                  String(event.dataTransfer?.types),
              );
              // A drag that started inside the editor (moving an image) is ProseMirror's own.
              if (!view.editable || view.dragging) return false;
              const files = imageFiles(event.dataTransfer?.files);
              if (files.length === 0) return false;
              event.preventDefault();
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
              void addImageFiles(view, host, files, at?.pos ?? view.state.selection.to);
              return true;
            },
          },
        }),
      ];
    },
  });
}

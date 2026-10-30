import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { OccurrenceRole } from '../../../shared/schemas/foreshadow.ts';
import { useThreads } from '../../api/foreshadows.ts';
import { MarkAnchorDialog } from '../foreshadow/MarkAnchorDialog.tsx';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { treeKey } from '../../api/nodes.ts';
import { fetchNodeContent } from '../../api/content.ts';
import { Button } from '../../components/ui.tsx';
import { normalizeContent } from '../../../shared/content-normalize.ts';
import { docToPlainText } from '../../../shared/prosemirror-text.ts';
import type { ContentDoc } from '../../../shared/schemas/content.ts';
import { FONT_STACKS, type DisplaySettings } from '../../../shared/schemas/display.ts';
import { countWords } from '../../../shared/wordcount.ts';
import { apiErrorMessage, formatWords, useT } from '../../i18n/index.ts';
import type { SectionSaver } from './autosave.ts';
import { DisplaySettingsDialog } from './DisplaySettingsDialog.tsx';
import { AnchorColors, anchorColorsKey } from './anchor-extension.ts';
import { createExtensions } from './extensions.ts';
import { SectionHeader } from './HeaderImage.tsx';
import { ImageLightbox } from './ImageLightbox.tsx';
import { ImagePickerDialog } from './ImagePickerDialog.tsx';
import { ImageHost } from './image-extension.ts';
import { FindBar } from './FindBar.tsx';
import { copyText } from './clipboard.ts';
import { cleanPastedHtmlReport } from './paste.ts';
import { saverRegistry, useSaverState } from './save-registry.ts';
import { hasUnsavedWork } from './unsaved-work.ts';
import { SnapshotDialog } from './SnapshotDialog.tsx';
import { Toolbar } from './Toolbar.tsx';
import styles from './editor.module.css';

interface Opened {
  content: ContentDoc;
  saver: SectionSaver;
}

/** The outcome of opening one section; `token` changes on every explicit reload. */
interface LoadResult {
  nodeId: string;
  token: number;
  epoch: number;
  opened: Opened | null;
  error: unknown;
}

/**
 * Opens a section. Anything still being saved for it is finished first, so the text read back is
 * never older than what was typed; text that could not be saved (error or conflict) is kept.
 */
async function openSection(nodeId: string): Promise<Opened> {
  const existing = saverRegistry.get(nodeId);
  if (existing) {
    await existing.flush();
    const unsaved = existing.unsavedContent();
    if (unsaved) return { content: normalizeContent(unsaved), saver: existing };
  }
  const node = await fetchNodeContent(nodeId);
  const saver = saverRegistry.getOrCreate(nodeId, node.rev);
  saver.reset(node.rev);
  // Shown exactly as it will be saved (ED-02: quotes never nest).
  return { content: normalizeContent(node.content), saver };
}

function displayStyle(display: DisplaySettings): CSSProperties {
  return {
    '--ed-font': FONT_STACKS[display.fontFamily],
    '--ed-size': `${display.fontSize}px`,
    '--ed-line': String(display.lineHeight),
    '--ed-indent': String(display.firstLineIndent),
    '--ed-width': `${display.editorWidth}px`,
    '--ed-para': `${display.paragraphSpacing}em`,
    ...(display.backgroundColor ? { '--ed-bg': display.backgroundColor } : {}),
  } as CSSProperties;
}

interface EditorPanelProps {
  bookId: string;
  nodeId: string;
  displayTitle: string;
  display: DisplaySettings;
  /** Words in the whole book as last saved, and in this section as last saved. */
  bookWords: number;
  savedSectionWords: number;
}

/** Main panel of the manuscript view: toolbar, find, text, counts (ED-01..08, DISP-01). */
export function EditorPanel(props: EditorPanelProps) {
  const { bookId, nodeId, display } = props;
  const t = useT();
  const [token, setToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  // Find & replace changes text on the server; the open section is then re-read, not kept.
  const epoch = useWorkspaceStore((s) => s.contentEpoch);

  useEffect(() => {
    let cancelled = false;
    openSection(nodeId).then(
      (opened) => !cancelled && setResult({ nodeId, token, epoch, opened, error: null }),
      (error: unknown) => !cancelled && setResult({ nodeId, token, epoch, opened: null, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [nodeId, token, epoch]);

  const current =
    result && result.nodeId === nodeId && result.token === token && result.epoch === epoch
      ? result
      : null;

  const reload = () => {
    saverRegistry.drop(nodeId);
    setToken((n) => n + 1);
  };

  return (
    <section
      className={styles.panel}
      data-theme={display.theme}
      style={displayStyle(display)}
      aria-label={t('editor.region')}
    >
      {display.backgroundImageAssetId ? (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          data-testid="editor-backdrop"
          style={{
            backgroundImage: `url(/assets/${bookId}/${display.backgroundImageAssetId})`,
            opacity: display.backgroundImageOpacity,
          }}
        />
      ) : null}
      {!current ? (
        <p className={styles.empty}>{t('common.loading')}</p>
      ) : !current.opened ? (
        <div className={styles.empty}>
          <p role="alert">{t('editor.open.failed', { message: apiErrorMessage(current.error) })}</p>
          <Button onClick={reload}>{t('editor.open.tryAgain')}</Button>
        </div>
      ) : (
        <SectionEditor
          key={`${current.nodeId}:${current.token}:${current.epoch}`}
          {...props}
          opened={current.opened}
          onReload={reload}
        />
      )}
    </section>
  );
}

function SectionEditor({
  bookId,
  displayTitle,
  display,
  bookWords,
  savedSectionWords,
  opened,
  onReload,
  nodeId,
}: EditorPanelProps & { opened: Opened; onReload: () => void }) {
  const { saver } = opened;
  const t = useT();
  const client = useQueryClient();
  const [anchorColors] = useState(() => new AnchorColors());
  const [imageHost] = useState(() => new ImageHost(bookId));
  const [extensions] = useState(() => createExtensions(anchorColors, imageHost));
  const [picker, setPicker] = useState<{
    mode: 'insert' | 'replace';
    onPick: (asset: { id: string }) => void;
  } | null>(null);
  const [zoomed, setZoomed] = useState<{ url: string; caption: string } | null>(null);
  useEffect(
    () =>
      imageHost.connect({ pick: (mode, onPick) => setPicker({ mode, onPick }), zoom: setZoomed }),
    [imageHost],
  );
  const threads = useThreads(bookId);
  const showAnchors = useWorkspaceStore((s) => s.showAnchors);
  const setShowAnchors = useWorkspaceStore((s) => s.setShowAnchors);
  const [marking, setMarking] = useState<{
    role: OccurrenceRole;
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [finding, setFinding] = useState(false);
  const [dialog, setDialog] = useState<'snapshots' | 'display' | null>(null);
  const state = useSaverState(saver);
  const stale = state === 'stale';
  const rejected = state === 'error' && saver.rejected;
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const editor = useEditor({
    extensions,
    content: opened.content,
    editorProps: {
      attributes: { 'aria-label': t('editor.sectionText'), 'data-testid': 'editor' },
      transformPastedHTML: (html) => {
        const { html: clean, removedImages } = cleanPastedHtmlReport(html);
        // Pasted web pages and documents never bring their images along (IMG-09).
        if (removedImages) {
          useWorkspaceStore
            .getState()
            .notify({ tone: 'info', message: t('images.notice.foreign') });
        }
        return clean;
      },
    },
    onUpdate: ({ editor: e }) => saver.update(normalizeContent(e.getJSON() as ContentDoc)),
  });

  // Leaving the section (switch, view change, route change) saves it right away.
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  // Anchored text takes its thread's color; redraw when the threads change (no document change).
  useEffect(() => {
    anchorColors.replace(
      new Map(
        (threads.data ?? []).flatMap((thread) =>
          thread.occurrences.map((o) => [o.id, thread.color] as const),
        ),
      ),
    );
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(anchorColorsKey, true));
    }
  }, [editor, threads.data, anchorColors]);

  // No update event: toggling editability is not an edit, and would mark the section unsaved.
  useEffect(() => {
    editor?.setEditable(!stale, false);
  }, [editor, stale]);

  // Cmd/Ctrl+F finds in this section instead of the browser's page search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { section: savedSectionWords, selection: 0 };
      const { doc, selection } = e.state;
      return {
        section: countWords(doc.textBetween(0, doc.content.size, '\n', ' ')),
        selection: selection.empty
          ? 0
          : countWords(doc.textBetween(selection.from, selection.to, '\n', ' ')),
      };
    },
  });

  if (!editor) return null;

  const bookTotal = Math.max(0, bookWords - savedSectionWords + words.section);

  return (
    <>
      <Toolbar
        editor={editor}
        editable={!stale}
        onFind={() => setFinding(true)}
        onSnapshots={() => {
          void saver.flush().then(() => setDialog('snapshots'));
        }}
        onDisplay={() => setDialog('display')}
        onInsertImage={() =>
          setPicker({
            mode: 'insert',
            onPick: (asset) => editor.chain().focus().insertImage({ assetId: asset.id }).run(),
          })
        }
        onMarkAnchor={(role) => {
          const { from, to, empty } = editor.state.selection;
          if (empty) return;
          setMarking({ role, from, to, text: editor.state.doc.textBetween(from, to, ' ') });
        }}
        showAnchors={showAnchors}
        onToggleAnchors={() => setShowAnchors(!showAnchors)}
      />
      {finding ? (
        <FindBar
          editor={editor}
          onClose={() => {
            setFinding(false);
            editor.commands.focus();
          }}
        />
      ) : null}
      {stale ? (
        <div className={styles.banner} role="alert">
          <span>{t('editor.banner.stale')}</span>
          <Button onClick={onReload}>{t('editor.banner.reload')}</Button>
        </div>
      ) : null}
      {rejected ? (
        <div className={styles.banner} role="alert" data-testid="save-rejected">
          <span>
            {t('editor.banner.rejected', {
              reason: saver.error ?? t('editor.banner.rejectedFallback'),
            })}
          </span>
          <Button
            onClick={() =>
              void copyText(docToPlainText(editor.getJSON() as ContentDoc)).then(
                () => setCopyNote(t('editor.copy.done')),
                (err: Error) => setCopyNote(t('editor.copy.failed', { reason: err.message })),
              )
            }
          >
            {t('editor.banner.copySection')}
          </Button>
          {copyNote ? <span role="status">{copyNote}</span> : null}
        </div>
      ) : null}
      <div className={styles.scroller}>
        <div className={styles.page}>
          <SectionHeader bookId={bookId} nodeId={nodeId} showImages={display.showImages}>
            <h2 className={styles.title}>{displayTitle}</h2>
          </SectionHeader>
          <div
            className={styles.prose}
            data-anchors={showAnchors ? 'on' : 'off'}
            data-images={display.showImages ? 'on' : 'off'}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      <div className={styles.footer} aria-label={t('editor.footer.label')}>
        <span>{t('editor.footer.section', { words: formatWords(words.section) })}</span>
        <span>{t('editor.footer.book', { words: formatWords(bookTotal) })}</span>
        {words.selection > 0 ? (
          <span>{t('editor.footer.selection', { words: formatWords(words.selection) })}</span>
        ) : null}
      </div>
      {dialog === 'snapshots' ? (
        <SnapshotDialog
          nodeId={nodeId}
          beforeRestore={() => saver.flush()}
          hasUnsaved={() => hasUnsavedWork([saver], [])}
          unsavedText={() => docToPlainText(editor.getJSON() as ContentDoc)}
          onClose={() => setDialog(null)}
          onRestored={() => {
            setDialog(null);
            void client.invalidateQueries({ queryKey: treeKey(bookId) });
            onReload();
          }}
        />
      ) : null}
      {marking ? (
        <MarkAnchorDialog
          bookId={bookId}
          nodeId={nodeId}
          role={marking.role}
          text={marking.text}
          onClose={() => {
            setMarking(null);
            editor.commands.focus();
          }}
          onMarked={(occurrenceId) => {
            editor
              .chain()
              .focus()
              .setTextSelection({ from: marking.from, to: marking.to })
              .setMark('foreshadowAnchor', { occurrenceId })
              .run();
            setMarking(null);
          }}
        />
      ) : null}
      {picker ? (
        <ImagePickerDialog
          bookId={bookId}
          mode={picker.mode}
          onClose={() => setPicker(null)}
          onPick={(asset) => {
            setPicker(null);
            picker.onPick(asset);
          }}
        />
      ) : null}
      {zoomed ? (
        <ImageLightbox url={zoomed.url} caption={zoomed.caption} onClose={() => setZoomed(null)} />
      ) : null}
      {dialog === 'display' ? (
        <DisplaySettingsDialog bookId={bookId} display={display} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

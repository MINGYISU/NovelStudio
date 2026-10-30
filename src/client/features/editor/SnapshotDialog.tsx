import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  restoreSnapshot,
  snapshotsKey,
  useSnapshotDetail,
  useSnapshots,
} from '../../api/content.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import {
  apiErrorMessage,
  formatDateTime,
  formatWords,
  useT,
  type MessageKey,
} from '../../i18n/index.ts';
import type { NodeContent } from '../../../shared/schemas/node.ts';
import { copyText } from './clipboard.ts';
import styles from './editor.module.css';

const REASONS: Record<string, MessageKey> = {
  open: 'editor.snapshot.reason.open',
  interval: 'editor.snapshot.reason.interval',
  'before-replace': 'editor.snapshot.reason.beforeReplace',
  'before-restore': 'editor.snapshot.reason.beforeRestore',
};

interface SnapshotDialogProps {
  nodeId: string;
  /** Sends any unsaved text first, so the newest text is what the restore snapshots. */
  beforeRestore: () => Promise<void>;
  /** True when, after `beforeRestore`, the section still has text the server does not have. */
  hasUnsaved: () => boolean;
  /** The section's current text, for copying it before it is discarded. */
  unsavedText: () => string;
  onRestored: (node: NodeContent) => void;
  onClose: () => void;
}

/** Snapshot browser (ED-10): previous versions of one section with timestamps; restoring is undoable. */
export function SnapshotDialog({
  nodeId,
  beforeRestore,
  hasUnsaved,
  unsavedText,
  onRestored,
  onClose,
}: SnapshotDialogProps) {
  const t = useT();
  const client = useQueryClient();
  const snapshots = useSnapshots(nodeId);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useSnapshotDetail(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedWarning, setUnsavedWarning] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const restore = async (discardUnsaved = false) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (!discardUnsaved) {
        await beforeRestore();
        // ED-12: restoring reloads the section, which would silently drop text the server lacks.
        if (hasUnsaved()) {
          setUnsavedWarning(true);
          setBusy(false);
          return;
        }
      }
      setUnsavedWarning(false);
      const node = await restoreSnapshot(selected);
      await client.invalidateQueries({ queryKey: snapshotsKey(nodeId) });
      onRestored(node);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title={t('editor.snapshot.title')}
      description={t('editor.snapshot.description')}
    >
      {snapshots.isPending ? <p>{t('common.loading')}</p> : null}
      {snapshots.error ? <FormError message={apiErrorMessage(snapshots.error)} /> : null}
      {snapshots.data?.length === 0 ? <p>{t('editor.snapshot.empty')}</p> : null}
      {snapshots.data && snapshots.data.length > 0 ? (
        <div className={styles.snapshotLayout}>
          <ul className={styles.snapshotList} aria-label={t('editor.snapshot.title')}>
            {snapshots.data.map((snapshot) => (
              <li key={snapshot.id}>
                <button
                  type="button"
                  className={styles.snapshotItem}
                  aria-current={snapshot.id === selected}
                  onClick={() => setSelected(snapshot.id)}
                >
                  {formatDateTime(snapshot.createdAt)}
                  <span className={styles.snapshotMeta}>
                    {REASONS[snapshot.reason] ? t(REASONS[snapshot.reason]!) : snapshot.reason} ·{' '}
                    {formatWords(snapshot.wordCount)}
                  </span>
                  <span className={styles.snapshotMeta}>{snapshot.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className={styles.snapshotPreview} aria-label={t('editor.snapshot.previewLabel')}>
            {selected === null
              ? t('editor.snapshot.selectToPreview')
              : detail.isPending
                ? t('common.loading')
                : detail.data?.plainText || t('editor.snapshot.emptyText')}
          </pre>
        </div>
      ) : null}
      <FormError message={error} />
      {unsavedWarning ? (
        <div
          className={styles.unsavedWarning}
          role="alertdialog"
          aria-label={t('editor.snapshot.unsavedLabel')}
        >
          <p>{t('editor.snapshot.unsavedWarning')}</p>
          <div className={uiStyles.actions}>
            <Button
              onClick={() =>
                void copyText(unsavedText()).then(
                  () => setCopyNote(t('editor.copy.done')),
                  (err: Error) => setCopyNote(t('editor.copy.failed', { reason: err.message })),
                )
              }
            >
              {t('editor.snapshot.copyUnsaved')}
            </Button>
            {copyNote ? <span role="status">{copyNote}</span> : null}
            <Button variant="danger" disabled={busy} onClick={() => void restore(true)}>
              {t('editor.snapshot.restoreAnyway')}
            </Button>
            <Button autoFocus onClick={() => setUnsavedWarning(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" disabled={!selected || busy} onClick={() => void restore()}>
            {t('editor.snapshot.restoreVersion')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

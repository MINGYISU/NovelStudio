import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  restoreSnapshot,
  snapshotsKey,
  useSnapshotDetail,
  useSnapshots,
} from '../../api/content.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { formatWords } from '../../pages/library/format.ts';
import type { NodeContent } from '../../../shared/schemas/node.ts';
import { copyText } from './clipboard.ts';
import styles from './editor.module.css';

const REASONS: Record<string, string> = {
  open: 'First edit',
  interval: 'While editing',
  'before-replace': 'Before replace',
  'before-restore': 'Before a restore',
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title="Snapshots"
      description="Earlier versions of this section. Restoring one saves the current text as a snapshot first."
    >
      {snapshots.isPending ? <p>Loading…</p> : null}
      {snapshots.error ? <FormError message={snapshots.error.message} /> : null}
      {snapshots.data?.length === 0 ? (
        <p>No snapshots yet. They are created automatically while you write.</p>
      ) : null}
      {snapshots.data && snapshots.data.length > 0 ? (
        <div className={styles.snapshotLayout}>
          <ul className={styles.snapshotList} aria-label="Snapshots">
            {snapshots.data.map((snapshot) => (
              <li key={snapshot.id}>
                <button
                  type="button"
                  className={styles.snapshotItem}
                  aria-current={snapshot.id === selected}
                  onClick={() => setSelected(snapshot.id)}
                >
                  {dateTime.format(new Date(snapshot.createdAt))}
                  <span className={styles.snapshotMeta}>
                    {REASONS[snapshot.reason] ?? snapshot.reason} ·{' '}
                    {formatWords(snapshot.wordCount)}
                  </span>
                  <span className={styles.snapshotMeta}>{snapshot.excerpt}</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className={styles.snapshotPreview} aria-label="Snapshot text">
            {selected === null
              ? 'Select a snapshot to preview it.'
              : detail.isPending
                ? 'Loading…'
                : detail.data?.plainText || '(empty)'}
          </pre>
        </div>
      ) : null}
      <FormError message={error} />
      {unsavedWarning ? (
        <div className={styles.unsavedWarning} role="alertdialog" aria-label="Unsaved text">
          <p>This section has text that is not saved. Restoring the snapshot will discard it.</p>
          <div className={uiStyles.actions}>
            <Button
              onClick={() =>
                void copyText(unsavedText()).then(
                  () => setCopyNote('Copied.'),
                  (err: Error) => setCopyNote(`Could not copy: ${err.message}`),
                )
              }
            >
              Copy unsaved text
            </Button>
            {copyNote ? <span role="status">{copyNote}</span> : null}
            <Button variant="danger" disabled={busy} onClick={() => void restore(true)}>
              Restore anyway
            </Button>
            <Button autoFocus onClick={() => setUnsavedWarning(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!selected || busy} onClick={() => void restore()}>
            Restore this version
          </Button>
        </div>
      )}
    </Dialog>
  );
}

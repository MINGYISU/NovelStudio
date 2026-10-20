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
  onRestored: (node: NodeContent) => void;
  onClose: () => void;
}

/** Snapshot browser (ED-10): previous versions of one section with timestamps; restoring is undoable. */
export function SnapshotDialog({
  nodeId,
  beforeRestore,
  onRestored,
  onClose,
}: SnapshotDialogProps) {
  const client = useQueryClient();
  const snapshots = useSnapshots(nodeId);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useSnapshotDetail(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await beforeRestore();
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
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" disabled={!selected || busy} onClick={() => void restore()}>
          Restore this version
        </Button>
      </div>
    </Dialog>
  );
}

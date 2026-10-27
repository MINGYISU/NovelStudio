import { useMemo, useState } from 'react';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { formatWords } from '../../pages/library/format.ts';
import { trashEntries } from './build-items.ts';
import styles from './manuscript.module.css';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

interface TrashDialogProps {
  nodes: readonly TreeNode[];
  structure: StructureSettings;
  onRestore: (node: TreeNode) => Promise<void>;
  onClose: () => void;
}

/** The book's trashed sections (TREE-08). Restoring is the only action; nothing is deleted here. */
export function TrashDialog({ nodes, structure, onRestore, onClose }: TrashDialogProps) {
  const entries = useMemo(() => trashEntries(nodes), [nodes]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = (node: TreeNode) => {
    setBusy(node.id);
    setError(null);
    onRestore(node).then(onClose, (err: Error) => {
      setError(err.message);
      setBusy(null);
    });
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title="Trash"
      description="A restored section goes back to the end of its original parent, or to the end of the book if that parent is gone or itself in the trash."
    >
      {entries.length === 0 ? <p>The trash is empty.</p> : null}
      {entries.length > 0 ? (
        <ul className={styles.trashList} aria-label="Trashed sections">
          {entries.map(({ node, sections, words }) => (
            <li key={node.id} className={styles.trashItem}>
              <div className={styles.trashText}>
                <span className={styles.trashTitle}>
                  <span className={styles.trashKind}>
                    {structure[node.kind].label || node.kind}
                  </span>{' '}
                  {node.title || '(untitled)'}
                </span>
                <span className={styles.trashMeta}>
                  Deleted {dateTime.format(new Date(node.deletedAt ?? 0))} ·{' '}
                  {sections === 1 ? '1 section' : `${sections} sections`} · {formatWords(words)}
                </span>
              </div>
              <Button disabled={busy !== null} onClick={() => restore(node)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <FormError message={error} />
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

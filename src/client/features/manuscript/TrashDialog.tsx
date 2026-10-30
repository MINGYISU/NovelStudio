import { useMemo, useState } from 'react';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, formatDateTime, formatWords, useT } from '../../i18n/index.ts';
import { trashEntries } from './build-items.ts';
import styles from './manuscript.module.css';

interface TrashDialogProps {
  nodes: readonly TreeNode[];
  structure: StructureSettings;
  onRestore: (node: TreeNode) => Promise<void>;
  onClose: () => void;
}

/** The book's trashed sections (TREE-08). Restoring is the only action; nothing is deleted here. */
export function TrashDialog({ nodes, structure, onRestore, onClose }: TrashDialogProps) {
  const t = useT();
  const entries = useMemo(() => trashEntries(nodes), [nodes]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = (node: TreeNode) => {
    setBusy(node.id);
    setError(null);
    onRestore(node).then(onClose, (err: unknown) => {
      setError(apiErrorMessage(err));
      setBusy(null);
    });
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title={t('manuscript.trash.title')}
      description={t('manuscript.trash.description')}
    >
      {entries.length === 0 ? <p>{t('manuscript.trash.empty')}</p> : null}
      {entries.length > 0 ? (
        <ul className={styles.trashList} aria-label={t('manuscript.trash.list')}>
          {entries.map(({ node, sections, words }) => (
            <li key={node.id} className={styles.trashItem}>
              <div className={styles.trashText}>
                <span className={styles.trashTitle}>
                  <span className={styles.trashKind}>
                    {structure[node.kind].label || node.kind}
                  </span>{' '}
                  {node.title || t('common.untitled')}
                </span>
                <span className={styles.trashMeta}>
                  {t('manuscript.trash.deleted', { date: formatDateTime(node.deletedAt ?? 0) })} ·{' '}
                  {t('manuscript.trash.sections', { count: sections })} · {formatWords(words)}
                </span>
              </div>
              <Button disabled={busy !== null} onClick={() => restore(node)}>
                {t('common.restore')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <FormError message={error} />
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </div>
    </Dialog>
  );
}

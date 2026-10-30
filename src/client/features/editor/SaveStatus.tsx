import { useState } from 'react';
import { useT } from '../../i18n/index.ts';
import { useSaveStatus } from './save-registry.ts';
import styles from './editor.module.css';

/** Save status in the top bar (PRD §3): Saving… / Saved / Error — click for details. */
export function SaveStatus() {
  const t = useT();
  const status = useSaveStatus((s) => s.status);
  const [showDetails, setShowDetails] = useState(false);

  if (status.kind === 'error') {
    return (
      <button
        type="button"
        className={`${styles.statusButton} ${styles.statusError}`}
        onClick={() => setShowDetails((v) => !v)}
        aria-live="polite"
        data-testid="save-status"
      >
        {showDetails
          ? t('editor.status.errorDetails', {
              message: status.message,
              hint: t(status.retrying ? 'editor.status.retrying' : 'editor.status.notSaved'),
            })
          : t('editor.status.errorSummary')}
      </button>
    );
  }
  if (status.kind === 'stale') {
    return (
      <span
        className={`${styles.statusButton} ${styles.statusStale}`}
        role="status"
        data-testid="save-status"
      >
        {t('editor.status.stale')}
      </span>
    );
  }
  return (
    <span
      className={`${styles.statusButton} ${status.kind === 'saving' ? styles.statusSaving : styles.statusSaved}`}
      role="status"
      data-testid="save-status"
    >
      {status.kind === 'saving' ? t('editor.status.saving') : t('editor.status.saved')}
    </span>
  );
}

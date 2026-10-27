import { useState } from 'react';
import { useSaveStatus } from './save-registry.ts';
import styles from './editor.module.css';

/** Save status in the top bar (PRD §3): Saving… / Saved / Error — click for details. */
export function SaveStatus() {
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
          ? `Error — ${status.message} (${status.retrying ? 'retrying' : 'not saved; copy your text'})`
          : 'Error — click for details'}
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
        Changed elsewhere — reload
      </span>
    );
  }
  return (
    <span
      className={`${styles.statusButton} ${status.kind === 'saving' ? styles.statusSaving : styles.statusSaved}`}
      role="status"
      data-testid="save-status"
    >
      {status.kind === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  );
}

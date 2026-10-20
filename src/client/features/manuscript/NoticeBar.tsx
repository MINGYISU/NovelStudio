import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import styles from './manuscript.module.css';

const INFO_TIMEOUT_MS = 10_000;

/** One notice at a time: errors stay until dismissed, informational notices fade out. */
export function NoticeBar() {
  const notice = useWorkspaceStore((s) => s.notice);
  const dismiss = useWorkspaceStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice || notice.tone !== 'info') return;
    const timer = setTimeout(dismiss, INFO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div
      className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : ''}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.message}</span>
      {notice.action ? (
        <button
          type="button"
          className={styles.noticeAction}
          onClick={() => {
            notice.action?.run();
            dismiss();
          }}
        >
          {notice.action.label}
        </button>
      ) : null}
      <button type="button" className={styles.iconButton} aria-label="Dismiss" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

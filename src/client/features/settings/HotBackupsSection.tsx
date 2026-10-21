import { useState } from 'react';
import { useCancelHotRestore, useHotBackups, useRestoreHotBackup } from '../../api/hot-backups.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import styles from './settings.module.css';

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** HOT-02: the automatic database copies, and restoring one (applied at the next start). */
export function HotBackupsSection() {
  const backups = useHotBackups();
  const restore = useRestoreHotBackup();
  const cancel = useCancelHotRestore();
  const [choice, setChoice] = useState<string | null>(null);
  const data = backups.data;

  return (
    <section className={styles.section} aria-labelledby="hot-heading">
      <h2 id="hot-heading">Automatic database backups</h2>
      <p className={styles.hint}>
        NovelStudio copies its database when it starts and hourly while you write, and keeps the
        newest 20. Restoring one replaces all books with the state at that time and takes effect the
        next time the server starts. Your current database is copied first and kept, so a restore
        can itself be undone.
      </p>
      {backups.error ? (
        <p className={styles.warning} role="alert">
          {backups.error.message}
        </p>
      ) : null}
      {data?.pending ? (
        <div className={styles.banner} role="status">
          <p>
            <strong>Restore of {data.pending.name} is waiting for a restart.</strong> Stop the
            server (Ctrl+C) and start NovelStudio again to finish. Anything you write before then
            will not be in the restored database.
          </p>
          <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel restore
          </Button>
        </div>
      ) : null}
      {data?.failed ? (
        <div className={styles.banner} role="alert">
          <p>
            The last restore ({data.failed.name}) could not be applied and nothing was changed:{' '}
            {data.failed.error}
          </p>
          <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Dismiss
          </Button>
        </div>
      ) : null}
      <FormError message={cancel.error?.message ?? null} />
      {data && data.backups.length === 0 ? <p className={styles.hint}>No backups yet.</p> : null}
      <ul className={styles.backupList} aria-label="Automatic database backups">
        {data?.backups.map((b) => (
          <li key={b.name}>
            <span>{b.name}</span>
            <span>{new Date(b.createdAt).toLocaleString()}</span>
            <span className={styles.hint}>{formatBytes(b.bytes)}</span>
            <Button onClick={() => setChoice(b.name)} aria-label={`Restore ${b.name}`}>
              Restore…
            </Button>
          </li>
        ))}
      </ul>
      {choice ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setChoice(null)}
          title="Restore this backup?"
          description={`All books will be replaced by the state in ${choice}. Nothing changes until the server restarts, and your current database is copied first.`}
        >
          <FormError message={restore.error?.message ?? null} />
          <div className={uiStyles.actions}>
            <Button onClick={() => setChoice(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(choice, {
                  onSuccess: () => setChoice(null),
                })
              }
            >
              {restore.isPending ? 'Preparing…' : 'Restore at next start'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

import { useState } from 'react';
import { useCancelHotRestore, useHotBackups, useRestoreHotBackup } from '../../api/hot-backups.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, formatDateTime, useT } from '../../i18n/index.ts';
import styles from './settings.module.css';

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** HOT-02: the automatic database copies, and restoring one (applied at the next start). */
export function HotBackupsSection() {
  const t = useT();
  const backups = useHotBackups();
  const restore = useRestoreHotBackup();
  const cancel = useCancelHotRestore();
  const [choice, setChoice] = useState<string | null>(null);
  const data = backups.data;

  return (
    <section className={styles.section} aria-labelledby="hot-heading">
      <h2 id="hot-heading">{t('settings.hot.title')}</h2>
      <p className={styles.hint}>{t('settings.hot.intro')}</p>
      {backups.error ? (
        <p className={styles.warning} role="alert">
          {apiErrorMessage(backups.error)}
        </p>
      ) : null}
      {data?.pending ? (
        <div className={styles.banner} role="status">
          <p>
            <strong>{t('settings.hot.pendingLead', { name: data.pending.name })}</strong>{' '}
            {t('settings.hot.pendingBody')}
          </p>
          <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {t('settings.hot.cancelRestore')}
          </Button>
        </div>
      ) : null}
      {data?.failed ? (
        <div className={styles.banner} role="alert">
          <p>
            {t('settings.hot.failed', { name: data.failed.name, error: data.failed.error ?? '' })}
          </p>
          <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {t('settings.hot.dismiss')}
          </Button>
        </div>
      ) : null}
      <FormError message={cancel.error ? apiErrorMessage(cancel.error) : null} />
      {data && data.backups.length === 0 ? (
        <p className={styles.hint}>{t('settings.hot.none')}</p>
      ) : null}
      <ul className={styles.backupList} aria-label={t('settings.hot.listAria')}>
        {data?.backups.map((b) => (
          <li key={b.name}>
            <span>{b.name}</span>
            <span>{formatDateTime(b.createdAt)}</span>
            <span className={styles.hint}>{formatBytes(b.bytes)}</span>
            <Button
              onClick={() => setChoice(b.name)}
              aria-label={t('settings.hot.restoreAria', { name: b.name })}
            >
              {t('settings.hot.restoreButton')}
            </Button>
          </li>
        ))}
      </ul>
      {choice ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setChoice(null)}
          title={t('settings.hot.confirmTitle')}
          description={t('settings.hot.confirmBody', { name: choice })}
        >
          <FormError message={restore.error ? apiErrorMessage(restore.error) : null} />
          <div className={uiStyles.actions}>
            <Button onClick={() => setChoice(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(choice, {
                  onSuccess: () => setChoice(null),
                })
              }
            >
              {restore.isPending ? t('settings.hot.preparing') : t('settings.hot.atNextStart')}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

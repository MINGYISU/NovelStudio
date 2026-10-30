import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useImportColdBackup } from '../../api/cold-backup.ts';
import { ApiRequestError } from '../../api/http.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import styles from './settings.module.css';

/** Import a cold backup (.novelstudio.json) as a new book (IMP-01, COLD-07). */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const importBackup = useImportColdBackup();
  const [file, setFile] = useState<File | null>(null);
  const [checksum, setChecksum] = useState<File | null>(null);
  const mismatch =
    importBackup.error instanceof ApiRequestError &&
    importBackup.error.code === 'CHECKSUM_MISMATCH';
  const result = importBackup.data;

  const run = (ignoreChecksum: boolean) => {
    if (file) importBackup.mutate({ file, checksum, ignoreChecksum });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('settings.import.title')}
      description={t('settings.import.description')}
    >
      <form onSubmit={submit}>
        <Field label={t('settings.import.fileLabel')}>
          <input
            className={uiStyles.input}
            type="file"
            accept=".json,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label={t('settings.import.fileAria')}
          />
        </Field>
        <Field label={t('settings.import.checksumLabel')}>
          <input
            className={uiStyles.input}
            type="file"
            accept=".sha256"
            onChange={(e) => setChecksum(e.target.files?.[0] ?? null)}
            aria-label={t('settings.import.checksumAria')}
          />
        </Field>
        <FormError message={importBackup.error ? apiErrorMessage(importBackup.error) : null} />
        {result ? (
          <div role="status">
            <p className={styles.ok}>
              {t('settings.import.imported', { title: result.book.title })}
            </p>
            {result.remapped ? (
              <p className={styles.hint}>{t('settings.import.remapped')}</p>
            ) : null}
            {result.warnings.map((w) => (
              <p key={w} className={styles.warning}>
                {w}
              </p>
            ))}
          </div>
        ) : null}
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{result ? t('common.close') : t('common.cancel')}</Button>
          {result ? (
            <Button
              variant="primary"
              onClick={() => navigate(`/book/${result.book.id}/manuscript`)}
            >
              {t('settings.import.openBook')}
            </Button>
          ) : mismatch ? (
            <Button variant="danger" onClick={() => run(true)} disabled={importBackup.isPending}>
              {t('settings.import.anyway')}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!file || importBackup.isPending}>
              {importBackup.isPending ? t('settings.import.importing') : t('common.import')}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

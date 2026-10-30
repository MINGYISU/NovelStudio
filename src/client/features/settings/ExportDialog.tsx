import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  chooseFolder,
  useColdBackupSettings,
  useExportAll,
  useExportBook,
} from '../../api/cold-backup.ts';
import { ApiRequestError } from '../../api/http.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, formatWords, useT } from '../../i18n/index.ts';
import type {
  ExportAllResponse,
  ExportResult,
} from '../../../shared/schemas/cold-backup-settings.ts';
import { useExportGuard } from './export-guard.tsx';
import styles from './settings.module.css';

export type ExportScope = { kind: 'book'; bookId: string; title: string } | { kind: 'all' };

function ResultLine({ result }: { result: ExportResult }) {
  const t = useT();
  return (
    <li>
      <strong>{result.title}</strong>
      <div className={styles.path}>{result.file}</div>
      <div className={styles.hint}>
        {t('settings.export.verified', {
          sections: t('settings.sectionCount', { count: result.stats.sections }),
          words: formatWords(result.stats.words),
        })}
      </div>
      {result.warnings.map((w) => (
        <div key={w} className={styles.warning}>
          {w}
        </div>
      ))}
    </li>
  );
}

/** Export this book / all books as cold backups (COLD-02). A one-off folder can replace the saved one. */
export function ExportDialog({ scope, onClose }: { scope: ExportScope; onClose: () => void }) {
  const t = useT();
  const settings = useColdBackupSettings();
  const exportBook = useExportBook();
  const exportAll = useExportAll();
  const [useOneOff, setUseOneOff] = useState(false);
  const [dir, setDir] = useState('');
  const [snapshots, setSnapshots] = useState<boolean | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { guard, element: exportGuard } = useExportGuard();

  const saved = settings.data?.settings;
  const includeSnapshots = snapshots ?? saved?.includeSnapshots ?? false;
  const noLocation = !useOneOff && !saved?.dir;
  const running = exportBook.isPending || exportAll.isPending;
  const error = exportBook.error ?? exportAll.error;
  const done = exportBook.data ?? exportAll.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { dir: useOneOff ? dir.trim() : undefined, includeSnapshots };
    // The backup is read from the server, so text and maps still being saved go first.
    guard(true, () => {
      if (scope.kind === 'book') exportBook.mutate({ bookId: scope.bookId, ...body });
      else exportAll.mutate(body);
    });
  };

  const pick = async () => {
    setPickerError(null);
    try {
      const picked = await chooseFolder();
      if (picked) setDir(picked);
    } catch (err) {
      setPickerError(apiErrorMessage(err));
    }
  };

  const allResults: ExportAllResponse['results'] | undefined = exportAll.data;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        scope.kind === 'book'
          ? t('settings.export.titleBook', { title: scope.title })
          : t('settings.export.titleAll')
      }
      description={t('settings.export.description')}
    >
      <form onSubmit={submit}>
        <fieldset className={styles.choice}>
          <label>
            <input type="radio" checked={!useOneOff} onChange={() => setUseOneOff(false)} />{' '}
            {t('settings.export.savedLocation')}{' '}
            <span className={styles.path}>{saved?.dir ?? t('settings.export.notSet')}</span>
          </label>
          <label>
            <input type="radio" checked={useOneOff} onChange={() => setUseOneOff(true)} />{' '}
            {t('settings.export.otherFolder')}
          </label>
        </fieldset>
        {useOneOff ? (
          <Field label={t('settings.export.folderLabel')}>
            <div className={styles.row}>
              <input
                className={uiStyles.input}
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder={t('settings.export.folderPlaceholder')}
                aria-label={t('settings.export.folderLabel')}
              />
              {settings.data?.pickerSupported ? (
                <Button onClick={() => void pick()}>{t('settings.export.choose')}</Button>
              ) : null}
            </div>
          </Field>
        ) : null}
        <FormError message={pickerError} />
        {noLocation ? (
          <p className={styles.hint}>
            {t('settings.export.noFolderBefore')}{' '}
            <Link to="/settings">{t('settings.export.settingsLink')}</Link>{' '}
            {t('settings.export.noFolderAfter')}
          </p>
        ) : null}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={includeSnapshots}
            onChange={(e) => setSnapshots(e.target.checked)}
          />{' '}
          {t('settings.export.includeSnapshots')}
        </label>
        <FormError message={error ? apiErrorMessage(error) : null} />
        {exportBook.data ? (
          <ul className={styles.results} aria-label={t('settings.export.resultAria')}>
            <ResultLine result={exportBook.data} />
          </ul>
        ) : null}
        {allResults ? (
          <ul className={styles.results} aria-label={t('settings.export.resultsAria')}>
            {allResults.map((r) =>
              r.ok ? (
                <ResultLine key={r.bookId} result={r.result} />
              ) : (
                <li key={r.bookId}>
                  <strong>{r.title}</strong>
                  <div className={styles.warning}>
                    {t('settings.export.failed', {
                      message: apiErrorMessage(
                        new ApiRequestError(0, r.error.code, r.error.message),
                      ),
                    })}
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : null}
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{done ? t('common.close') : t('common.cancel')}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={running || noLocation || (useOneOff && dir.trim() === '')}
          >
            {running ? t('settings.export.exporting') : t('common.export')}
          </Button>
        </div>
      </form>
      {exportGuard}
    </Dialog>
  );
}

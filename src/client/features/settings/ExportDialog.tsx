import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  chooseFolder,
  useColdBackupSettings,
  useExportAll,
  useExportBook,
} from '../../api/cold-backup.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import type {
  ExportAllResponse,
  ExportResult,
} from '../../../shared/schemas/cold-backup-settings.ts';
import styles from './settings.module.css';

export type ExportScope = { kind: 'book'; bookId: string; title: string } | { kind: 'all' };

function ResultLine({ result }: { result: ExportResult }) {
  return (
    <li>
      <strong>{result.title}</strong>
      <div className={styles.path}>{result.file}</div>
      <div className={styles.hint}>
        Verified · {result.stats.sections.toLocaleString()} sections ·{' '}
        {result.stats.words.toLocaleString()} words
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
  const settings = useColdBackupSettings();
  const exportBook = useExportBook();
  const exportAll = useExportAll();
  const [useOneOff, setUseOneOff] = useState(false);
  const [dir, setDir] = useState('');
  const [snapshots, setSnapshots] = useState<boolean | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const saved = settings.data?.settings;
  const includeSnapshots = snapshots ?? saved?.includeSnapshots ?? false;
  const noLocation = !useOneOff && !saved?.dir;
  const running = exportBook.isPending || exportAll.isPending;
  const error = exportBook.error ?? exportAll.error;
  const done = exportBook.data ?? exportAll.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { dir: useOneOff ? dir.trim() : undefined, includeSnapshots };
    if (scope.kind === 'book') exportBook.mutate({ bookId: scope.bookId, ...body });
    else exportAll.mutate(body);
  };

  const pick = async () => {
    setPickerError(null);
    try {
      const picked = await chooseFolder();
      if (picked) setDir(picked);
    } catch (err) {
      setPickerError((err as Error).message);
    }
  };

  const allResults: ExportAllResponse['results'] | undefined = exportAll.data;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={scope.kind === 'book' ? `Export “${scope.title}”` : 'Export all books'}
      description="Writes a plain JSON cold backup (with a .sha256 file) that can be read without NovelStudio, then verifies it."
    >
      <form onSubmit={submit}>
        <fieldset className={styles.choice}>
          <label>
            <input type="radio" checked={!useOneOff} onChange={() => setUseOneOff(false)} /> Saved
            location: <span className={styles.path}>{saved?.dir ?? 'not set'}</span>
          </label>
          <label>
            <input type="radio" checked={useOneOff} onChange={() => setUseOneOff(true)} /> Another
            folder, just this once
          </label>
        </fieldset>
        {useOneOff ? (
          <Field label="Folder (absolute path)">
            <div className={styles.row}>
              <input
                className={uiStyles.input}
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="/Volumes/Backup/NovelStudio"
                aria-label="Folder (absolute path)"
              />
              {settings.data?.pickerSupported ? (
                <Button onClick={() => void pick()}>Choose…</Button>
              ) : null}
            </div>
          </Field>
        ) : null}
        <FormError message={pickerError} />
        {noLocation ? (
          <p className={styles.hint}>
            No folder is saved yet. Set one in <Link to="/settings">Settings</Link> or use another
            folder.
          </p>
        ) : null}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={includeSnapshots}
            onChange={(e) => setSnapshots(e.target.checked)}
          />{' '}
          Include snapshots (larger files)
        </label>
        <FormError message={error ? `${error.message}` : null} />
        {exportBook.data ? (
          <ul className={styles.results} aria-label="Export result">
            <ResultLine result={exportBook.data} />
          </ul>
        ) : null}
        {allResults ? (
          <ul className={styles.results} aria-label="Export results">
            {allResults.map((r) =>
              r.ok ? (
                <ResultLine key={r.bookId} result={r.result} />
              ) : (
                <li key={r.bookId}>
                  <strong>{r.title}</strong>
                  <div className={styles.warning}>Failed: {r.error.message}</div>
                </li>
              ),
            )}
          </ul>
        ) : null}
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={running || noLocation || (useOneOff && dir.trim() === '')}
          >
            {running ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

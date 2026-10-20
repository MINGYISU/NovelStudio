import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useImportColdBackup } from '../../api/cold-backup.ts';
import { ApiRequestError } from '../../api/http.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import styles from './settings.module.css';

/** Import a cold backup (.novelstudio.json) as a new book (IMP-01, COLD-07). */
export function ImportDialog({ onClose }: { onClose: () => void }) {
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
      title="Import a cold backup"
      description="Restores a .novelstudio.json file as a new book. Existing books are never changed."
    >
      <form onSubmit={submit}>
        <Field label="Backup file (.novelstudio.json)">
          <input
            className={uiStyles.input}
            type="file"
            accept=".json,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Backup file"
          />
        </Field>
        <Field label="Checksum file (.sha256), optional">
          <input
            className={uiStyles.input}
            type="file"
            accept=".sha256"
            onChange={(e) => setChecksum(e.target.files?.[0] ?? null)}
            aria-label="Checksum file"
          />
        </Field>
        <FormError message={importBackup.error?.message ?? null} />
        {result ? (
          <div role="status">
            <p className={styles.ok}>Imported “{result.book.title}”.</p>
            {result.remapped ? (
              <p className={styles.hint}>Some ids already existed, so new ones were created.</p>
            ) : null}
            {result.warnings.map((w) => (
              <p key={w} className={styles.warning}>
                {w}
              </p>
            ))}
          </div>
        ) : null}
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {result ? (
            <Button
              variant="primary"
              onClick={() => navigate(`/book/${result.book.id}/manuscript`)}
            >
              Open book
            </Button>
          ) : mismatch ? (
            <Button variant="danger" onClick={() => run(true)} disabled={importBackup.isPending}>
              Import anyway
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!file || importBackup.isPending}>
              {importBackup.isPending ? 'Importing…' : 'Import'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

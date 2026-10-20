import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useBooks } from '../../api/books.ts';
import {
  chooseFolder,
  useColdBackupSettings,
  useSaveColdBackupSettings,
  useVerifyBackups,
  validateLocation,
} from '../../api/cold-backup.ts';
import { Button, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { isBackupOverdue } from '../../../shared/cold-backup.ts';
import type {
  ColdBackupSettingsResponse,
  ValidateLocationResponse,
} from '../../../shared/schemas/cold-backup-settings.ts';
import libraryStyles from '../library/library.module.css';
import styles from '../../features/settings/settings.module.css';

/** Settings (COLD-01, COLD-06, COLD-10): where cold backups go, retention, reminders, verification. */
export function SettingsPage() {
  const settings = useColdBackupSettings();
  return (
    <main className={styles.page}>
      <header className={libraryStyles.header}>
        <Link className={libraryStyles.sort} to="/">
          <ArrowLeft size={16} /> Library
        </Link>
        <h1 className={libraryStyles.heading}>Settings</h1>
      </header>
      {settings.isPending ? <p className={libraryStyles.empty}>Loading…</p> : null}
      {settings.error ? (
        <p className={`${libraryStyles.empty} ${libraryStyles.error}`} role="alert">
          {settings.error.message}
        </p>
      ) : null}
      {settings.data ? <ColdBackupSection data={settings.data} /> : null}
    </main>
  );
}

function ColdBackupSection({ data }: { data: ColdBackupSettingsResponse }) {
  const save = useSaveColdBackupSettings();
  const books = useBooks({ sort: 'title', trashed: false });
  const verify = useVerifyBackups();
  const [dir, setDir] = useState(data.settings.dir ?? '');
  const [keepOn, setKeepOn] = useState(data.settings.keepNewestPerBook !== null);
  const [keepN, setKeepN] = useState(data.settings.keepNewestPerBook ?? 5);
  const [snapshots, setSnapshots] = useState(data.settings.includeSnapshots);
  const [days, setDays] = useState(data.settings.reminderDays);
  const [validation, setValidation] = useState<ValidateLocationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  const check = async () => {
    setMessage(null);
    try {
      setValidation(await validateLocation(dir.trim()));
    } catch (err) {
      setValidation(null);
      setMessage((err as Error).message);
    }
  };

  const pick = async () => {
    setMessage(null);
    try {
      const picked = await chooseFolder();
      if (picked) {
        setDir(picked);
        setValidation(null);
      }
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    save.mutate(
      {
        dir: dir.trim() === '' ? null : dir.trim(),
        keepNewestPerBook: keepOn ? keepN : null,
        includeSnapshots: snapshots,
        reminderDays: days,
      },
      { onSuccess: () => setMessage('Saved.') },
    );
  };

  const now = new Date();
  return (
    <>
      <section className={styles.section} aria-labelledby="cold-heading">
        <h2 id="cold-heading">Cold backup</h2>
        <p className={styles.hint}>
          A plain JSON copy of each book that can be read without NovelStudio. Choose a folder on
          another disk or in a synced folder (iCloud Drive, Dropbox). It cannot be inside the
          NovelStudio data or source folders.
        </p>
        <form onSubmit={submit}>
          <Field label="Cold backup folder (absolute path)">
            <div className={styles.row}>
              <input
                className={uiStyles.input}
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value);
                  setValidation(null);
                }}
                placeholder="/Volumes/Backup/NovelStudio Cold Backups"
                aria-label="Cold backup folder (absolute path)"
              />
              <Button onClick={() => void check()} disabled={dir.trim() === ''}>
                Validate
              </Button>
              {data.pickerSupported ? <Button onClick={() => void pick()}>Choose…</Button> : null}
            </div>
          </Field>
          {validation ? (
            <p className={validation.ok ? styles.ok : styles.warning} role="status">
              {validation.message}
            </p>
          ) : null}
          <label className={styles.check}>
            <input type="checkbox" checked={keepOn} onChange={(e) => setKeepOn(e.target.checked)} />{' '}
            Keep only the newest
            <input
              className={uiStyles.input}
              type="number"
              min={1}
              max={1000}
              value={keepN}
              disabled={!keepOn}
              onChange={(e) => setKeepN(Number(e.target.value))}
              aria-label="Number of backups to keep per book"
              style={{ width: '5rem' }}
            />
            backups per book (off by default: nothing is ever deleted)
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={snapshots}
              onChange={(e) => setSnapshots(e.target.checked)}
            />{' '}
            Include section snapshots (larger files)
          </label>
          <label className={styles.check}>
            Remind me when a book has not been backed up for
            <input
              className={uiStyles.input}
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Reminder days"
              style={{ width: '5rem' }}
            />
            days
          </label>
          <FormError message={save.error?.message ?? null} />
          {message ? (
            <p className={styles.hint} role="status">
              {message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save settings
          </Button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="backups-heading">
        <h2 id="backups-heading">Backups</h2>
        <div className={styles.row} style={{ margin: '0.75rem 0' }}>
          <Button variant="primary" onClick={() => setExportingAll(true)}>
            Export all books…
          </Button>
          <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
            Verify latest backups
          </Button>
        </div>
        <FormError message={verify.error?.message ?? null} />
        {verify.data ? (
          <ul className={styles.results} aria-label="Verification results">
            {verify.data.length === 0 ? <li>No backups have been made yet.</li> : null}
            {verify.data.map((r) => (
              <li key={r.bookId}>
                <span className={r.ok ? styles.ok : styles.warning}>{r.ok ? 'OK' : 'Problem'}</span>{' '}
                <span className={styles.path}>{r.file}</span>
                {r.problems.map((p) => (
                  <div key={p} className={styles.warning}>
                    {p}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Book</th>
              <th>Last cold backup</th>
            </tr>
          </thead>
          <tbody>
            {books.data?.map((book) => {
              const last = data.last[book.id];
              const overdue = isBackupOverdue(last?.at, now, data.settings.reminderDays);
              return (
                <tr key={book.id}>
                  <td>{book.title}</td>
                  <td className={overdue ? styles.overdue : undefined}>
                    {last ? new Date(last.at).toLocaleString() : 'Never'}
                    {last ? <div className={styles.path}>{last.file}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {exportingAll ? (
        <ExportDialog scope={{ kind: 'all' }} onClose={() => setExportingAll(false)} />
      ) : null}
    </>
  );
}

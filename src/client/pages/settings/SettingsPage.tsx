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
import { apiErrorMessage, formatDateTime, useT } from '../../i18n/index.ts';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { LanguageSection } from '../../features/settings/LanguageSection.tsx';
import { HotBackupsSection } from '../../features/settings/HotBackupsSection.tsx';
import { isBackupOverdue } from '../../../shared/cold-backup.ts';
import type {
  ColdBackupSettingsResponse,
  ValidateLocationResponse,
} from '../../../shared/schemas/cold-backup-settings.ts';
import libraryStyles from '../library/library.module.css';
import styles from '../../features/settings/settings.module.css';

/** Settings (COLD-01, COLD-06, COLD-10): where cold backups go, retention, reminders, verification. */
export function SettingsPage() {
  const t = useT();
  const settings = useColdBackupSettings();
  return (
    <main className={styles.page}>
      <header className={libraryStyles.header}>
        <Link className={libraryStyles.sort} to="/">
          <ArrowLeft size={16} /> {t('settings.page.library')}
        </Link>
        <h1 className={libraryStyles.heading}>{t('settings.page.title')}</h1>
      </header>
      {settings.isPending ? <p className={libraryStyles.empty}>{t('common.loading')}</p> : null}
      {settings.error ? (
        <p className={`${libraryStyles.empty} ${libraryStyles.error}`} role="alert">
          {apiErrorMessage(settings.error)}
        </p>
      ) : null}
      <LanguageSection />
      {settings.data ? <ColdBackupSection data={settings.data} /> : null}
      <HotBackupsSection />
    </main>
  );
}

function ColdBackupSection({ data }: { data: ColdBackupSettingsResponse }) {
  const t = useT();
  const save = useSaveColdBackupSettings();
  const books = useBooks({ sort: 'title', trashed: false });
  const verify = useVerifyBackups();
  const [dir, setDir] = useState(data.settings.dir ?? '');
  const [keepOn, setKeepOn] = useState(data.settings.keepNewestPerBook !== null);
  const [keepN, setKeepN] = useState(data.settings.keepNewestPerBook ?? 5);
  const [snapshots, setSnapshots] = useState(data.settings.includeSnapshots);
  const [days, setDays] = useState(data.settings.reminderDays);
  const [autoDaily, setAutoDaily] = useState(data.settings.autoDaily);
  const [validation, setValidation] = useState<ValidateLocationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  const check = async () => {
    setMessage(null);
    try {
      setValidation(await validateLocation(dir.trim()));
    } catch (err) {
      setValidation(null);
      setMessage(apiErrorMessage(err));
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
      setMessage(apiErrorMessage(err));
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
        autoDaily,
      },
      { onSuccess: () => setMessage(t('settings.cold.saved')) },
    );
  };

  const now = new Date();
  return (
    <>
      <section className={styles.section} aria-labelledby="cold-heading">
        <h2 id="cold-heading">{t('settings.cold.title')}</h2>
        <p className={styles.hint}>{t('settings.cold.intro')}</p>
        <form onSubmit={submit}>
          <Field label={t('settings.cold.folderLabel')}>
            <div className={styles.row}>
              <input
                className={uiStyles.input}
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value);
                  setValidation(null);
                }}
                placeholder={t('settings.cold.folderPlaceholder')}
                aria-label={t('settings.cold.folderLabel')}
              />
              <Button onClick={() => void check()} disabled={dir.trim() === ''}>
                {t('settings.cold.validate')}
              </Button>
              {data.pickerSupported ? (
                <Button onClick={() => void pick()}>{t('settings.cold.choose')}</Button>
              ) : null}
            </div>
          </Field>
          {validation ? (
            <p className={validation.ok ? styles.ok : styles.warning} role="status">
              {validation.message}
            </p>
          ) : null}
          <label className={styles.check}>
            <input type="checkbox" checked={keepOn} onChange={(e) => setKeepOn(e.target.checked)} />{' '}
            {t('settings.cold.keepBefore')}
            <input
              className={uiStyles.input}
              type="number"
              min={1}
              max={1000}
              value={keepN}
              disabled={!keepOn}
              onChange={(e) => setKeepN(Number(e.target.value))}
              aria-label={t('settings.cold.keepAria')}
              style={{ width: '5rem' }}
            />
            {t('settings.cold.keepAfter')}
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={snapshots}
              onChange={(e) => setSnapshots(e.target.checked)}
            />{' '}
            {t('settings.cold.includeSnapshots')}
          </label>
          <label className={styles.check}>
            {t('settings.cold.remindBefore')}
            <input
              className={uiStyles.input}
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label={t('settings.cold.remindAria')}
              style={{ width: '5rem' }}
            />
            {t('settings.cold.remindAfter')}
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={autoDaily}
              onChange={(e) => setAutoDaily(e.target.checked)}
            />{' '}
            {t('settings.cold.autoDaily')}
          </label>
          {data.autoDailyLast ? (
            <p
              className={data.autoDailyLast.ok ? styles.hint : styles.warning}
              role={data.autoDailyLast.ok ? 'status' : 'alert'}
            >
              {t('settings.cold.autoLast', {
                time: formatDateTime(data.autoDailyLast.at),
                message: data.autoDailyLast.message,
              })}
            </p>
          ) : null}
          <FormError message={save.error ? apiErrorMessage(save.error) : null} />
          {message ? (
            <p className={styles.hint} role="status">
              {message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t('settings.cold.save')}
          </Button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="backups-heading">
        <h2 id="backups-heading">{t('settings.backups.title')}</h2>
        <div className={styles.row} style={{ margin: '0.75rem 0' }}>
          <Button variant="primary" onClick={() => setExportingAll(true)}>
            {t('settings.backups.exportAll')}
          </Button>
          <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
            {t('settings.backups.verify')}
          </Button>
        </div>
        <FormError message={verify.error ? apiErrorMessage(verify.error) : null} />
        {verify.data ? (
          <ul className={styles.results} aria-label={t('settings.backups.resultsAria')}>
            {verify.data.length === 0 ? <li>{t('settings.backups.noneYet')}</li> : null}
            {verify.data.map((r) => (
              <li key={r.bookId}>
                <span className={r.ok ? styles.ok : styles.warning}>
                  {r.ok ? t('settings.backups.ok') : t('settings.backups.problem')}
                </span>{' '}
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
              <th>{t('settings.backups.book')}</th>
              <th>{t('settings.backups.lastCold')}</th>
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
                    {last ? formatDateTime(last.at) : t('common.never')}
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

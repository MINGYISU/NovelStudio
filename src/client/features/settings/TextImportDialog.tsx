import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IMPORT_PRESETS,
  MAX_TEXT_IMPORT_BYTES,
  MAX_TEXT_IMPORT_LABEL,
} from '../../../shared/schemas/import.ts';
import { useTextImportCommit, useTextImportPreview } from '../../api/text-import.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, formatWords, useT } from '../../i18n/index.ts';
import styles from './settings.module.css';

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '').trim();
}

/** Import a TXT or Markdown file as a new book, with a preview of the detected sections (IMP-02/03). */
export function TextImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const preview = useTextImportPreview();
  const commit = useTextImportCommit();
  const [file, setFile] = useState<File | null>(null);
  const [detect, setDetect] = useState(true);
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<(typeof IMPORT_PRESETS)[number] | null>(null);
  const tooLarge = file !== null && file.size > MAX_TEXT_IMPORT_BYTES;

  useEffect(() => {
    if (file && !tooLarge) preview.mutate({ file, detect });
    // The preview is re-requested only when the file or the detection switch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, detect, tooLarge]);

  const data = preview.data;
  const result = commit.data;
  const chosenPreset = preset ?? data?.suggestedPreset ?? 'english';

  const run = () => {
    if (!file || !data) return;
    commit.mutate({
      file,
      detect,
      title: title.trim() || undefined,
      preset: chosenPreset,
    });
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title={t('settings.textImport.title')}
      description={t('settings.textImport.description')}
    >
      <Field label={t('settings.textImport.fileLabel')}>
        <input
          className={uiStyles.input}
          type="file"
          accept=".txt,.text,.md,.markdown,text/plain,text/markdown"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            setFile(next);
            setTitle(next ? baseName(next.name) : '');
            setPreset(null);
            commit.reset();
          }}
          aria-label={t('settings.textImport.fileAria')}
        />
      </Field>
      {tooLarge ? (
        <p className={styles.warning} role="alert">
          {t('settings.textImport.tooLarge', { limit: MAX_TEXT_IMPORT_LABEL })}
        </p>
      ) : null}
      <FormError
        message={
          preview.error
            ? apiErrorMessage(preview.error)
            : commit.error
              ? apiErrorMessage(commit.error)
              : null
        }
      />

      {data && !result ? (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={detect}
              onChange={(e) => setDetect(e.target.checked)}
              aria-label={t('settings.textImport.detectAria')}
            />
            {t('settings.textImport.detectLabel')}
          </label>
          <Field label={t('settings.textImport.bookTitle')}>
            <input
              className={uiStyles.input}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t('settings.textImport.bookTitle')}
            />
          </Field>
          <Field label={t('settings.textImport.numberingLabel')}>
            <select
              className={uiStyles.input}
              value={chosenPreset}
              onChange={(e) => setPreset(e.target.value as (typeof IMPORT_PRESETS)[number])}
              aria-label={t('settings.textImport.numberingAria')}
            >
              {IMPORT_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`settings.textImport.preset.${p}`)}
                </option>
              ))}
            </select>
          </Field>
          <p className={styles.hint} role="status">
            {t('settings.textImport.summary', {
              detected: data.detected
                ? t('settings.textImport.detected', { count: data.sections.length })
                : t('settings.textImport.notDetected'),
              words: formatWords(data.totalWords),
              encoding: data.encoding,
            })}
          </p>
          {data.warnings.map((w) => (
            <p key={w} className={styles.warning}>
              {w}
            </p>
          ))}
          <ol className={styles.preview} aria-label={t('settings.textImport.previewAria')}>
            {data.sections.map((s, i) => (
              <li
                key={i}
                className={s.parentIndex === null ? undefined : styles.previewChild}
                data-kind={s.kind}
              >
                <strong>
                  {s.kind === 'volume' ? t('settings.textImport.volumePrefix') : ''}
                  {s.title || t('common.untitled')}
                </strong>
                {s.unnumbered ? (
                  <span className={styles.hint}>{t('settings.textImport.unnumbered')}</span>
                ) : null}
                <span className={styles.hint}>
                  {t('settings.textImport.sectionWords', { words: formatWords(s.wordCount) })}
                </span>
                {s.excerpt ? <div className={styles.hint}>{s.excerpt}</div> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {result ? (
        <div role="status">
          <p className={styles.ok}>
            {t('settings.textImport.result', {
              title: result.book.title,
              count: result.sectionCount,
            })}
          </p>
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
          <Button variant="primary" onClick={() => navigate(`/book/${result.book.id}/manuscript`)}>
            {t('settings.import.openBook')}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={run}
            disabled={!data || tooLarge || commit.isPending || preview.isPending}
          >
            {commit.isPending
              ? t('settings.import.importing')
              : data
                ? t('settings.textImport.importSections', { count: data.sections.length })
                : t('common.import')}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

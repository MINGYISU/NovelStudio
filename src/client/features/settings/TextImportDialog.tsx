import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  IMPORT_PRESETS,
  MAX_TEXT_IMPORT_BYTES,
  MAX_TEXT_IMPORT_LABEL,
} from '../../../shared/schemas/import.ts';
import { useTextImportCommit, useTextImportPreview } from '../../api/text-import.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import styles from './settings.module.css';

const PRESET_LABELS: Record<(typeof IMPORT_PRESETS)[number], string> = {
  english: 'English (Chapter 1, Chapter 2…)',
  chinese: 'Chinese (第一章, 第二章…)',
};

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '').trim();
}

/** Import a TXT or Markdown file as a new book, with a preview of the detected sections (IMP-02/03). */
export function TextImportDialog({ onClose }: { onClose: () => void }) {
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
      title="Import text or Markdown"
      description="Creates a new book from a .txt or .md file. Chapters are detected from headings such as 第十二章, Chapter 12 or # Heading. Nothing is created until you confirm."
    >
      <Field label="File (.txt, .md)">
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
          aria-label="Text file"
        />
      </Field>
      {tooLarge ? (
        <p className={styles.warning} role="alert">
          This file is larger than {MAX_TEXT_IMPORT_LABEL}, so it cannot be imported and nothing
          will be changed. Split it into smaller files and import them one at a time.
        </p>
      ) : null}
      <FormError message={preview.error?.message ?? commit.error?.message ?? null} />

      {data && !result ? (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={detect}
              onChange={(e) => setDetect(e.target.checked)}
              aria-label="Detect chapters"
            />
            Detect chapters from headings
          </label>
          <Field label="Book title">
            <input
              className={uiStyles.input}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Book title"
            />
          </Field>
          <Field label="Chapter numbering style">
            <select
              className={uiStyles.input}
              value={chosenPreset}
              onChange={(e) => setPreset(e.target.value as (typeof IMPORT_PRESETS)[number])}
              aria-label="Numbering style"
            >
              {IMPORT_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <p className={styles.hint} role="status">
            {data.detected
              ? `${data.sections.length} sections detected`
              : 'No chapter detection: the whole file becomes one section'}
            {' · '}
            {data.totalWords.toLocaleString()} words · {data.encoding}
          </p>
          {data.warnings.map((w) => (
            <p key={w} className={styles.warning}>
              {w}
            </p>
          ))}
          <ol className={styles.preview} aria-label="Detected sections">
            {data.sections.map((s, i) => (
              <li
                key={i}
                className={s.parentIndex === null ? undefined : styles.previewChild}
                data-kind={s.kind}
              >
                <strong>
                  {s.kind === 'volume' ? 'Volume: ' : ''}
                  {s.title || '(untitled)'}
                </strong>
                {s.unnumbered ? <span className={styles.hint}> · unnumbered</span> : null}
                <span className={styles.hint}> · {s.wordCount.toLocaleString()} words</span>
                {s.excerpt ? <div className={styles.hint}>{s.excerpt}</div> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {result ? (
        <div role="status">
          <p className={styles.ok}>
            Imported “{result.book.title}” with {result.sectionCount}{' '}
            {result.sectionCount === 1 ? 'section' : 'sections'}.
          </p>
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
          <Button variant="primary" onClick={() => navigate(`/book/${result.book.id}/manuscript`)}>
            Open book
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={run}
            disabled={!data || tooLarge || commit.isPending || preview.isPending}
          >
            {commit.isPending
              ? 'Importing…'
              : data
                ? `Import ${data.sections.length} ${data.sections.length === 1 ? 'section' : 'sections'}`
                : 'Import'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { newFieldKey } from '../../../shared/codex.ts';
import {
  CODEX_FIELD_TYPES,
  CODEX_LABEL_MAX,
  CODEX_MAX_FIELDS,
  CODEX_SUMMARY_MAX,
  CODEX_TITLE_MAX,
  CODEX_VALUE_MAX,
  type CodexCategory,
  type CodexEntry,
  type CodexField,
  type CodexFieldType,
  type PatchEntryBody,
} from '../../../shared/schemas/codex.ts';
import { patchEntry, storeEntry, uploadEntryImage, useDeleteEntry } from '../../api/codex.ts';
import { Button, Dialog, uiStyles } from '../../components/ui.tsx';
import { type MessageKey, useT } from '../../i18n/index.ts';
import styles from './codex.module.css';
import { reportCodexError } from './errors.ts';
import { FIELD_TYPE_LABEL_KEYS, moveItem } from './TemplateDialog.tsx';

const SAVE_DELAY_MS = 600;

interface Draft {
  title: string;
  summary: string;
  fields: CodexField[];
}

const sameFields = (a: readonly CodexField[], b: readonly CodexField[]): boolean =>
  a.length === b.length &&
  a.every(
    (f, i) =>
      f.key === b[i]?.key &&
      f.label === b[i]?.label &&
      f.type === b[i]?.type &&
      f.value === b[i]?.value,
  );

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

const STATUS_LABEL_KEYS: Record<SaveStatus, MessageKey> = {
  saved: 'codex.editor.status.saved',
  dirty: 'codex.editor.status.dirty',
  saving: 'codex.editor.status.saving',
  error: 'codex.editor.status.error',
};

const isDirty = (now: Draft, before: Draft): boolean =>
  (now.title.trim() !== '' && now.title.trim() !== before.title) ||
  now.summary.trim() !== before.summary ||
  !sameFields(
    now.fields.map((f) => ({ ...f, label: f.label.trim() || f.key })),
    before.fields,
  );

interface EntryEditorProps {
  bookId: string;
  entry: CodexEntry;
  category: CodexCategory | undefined;
}

/** CDX-04, CDX-06: edit one entry; text is saved shortly after typing stops and when focus leaves. */
export function EntryEditor({ bookId, entry, category }: EntryEditorProps) {
  const t = useT();
  const client = useQueryClient();
  const navigate = useNavigate();
  const remove = useDeleteEntry(bookId);

  const [draft, setDraft] = useState<Draft>({
    title: entry.title,
    summary: entry.summary,
    fields: entry.fields,
  });
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<CodexFieldType>('text');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const latest = useRef(draft);
  const saved = useRef<Draft>({ ...draft });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const discarded = useRef(false);

  const flush = useCallback(() => {
    if (discarded.current) return;
    const now = latest.current;
    const before = saved.current;
    const title = now.title.trim();
    const summary = now.summary.trim();
    const fields = now.fields.map((f) => ({ ...f, label: f.label.trim() || f.key }));
    const patch: PatchEntryBody = {};
    if (title !== '' && title !== before.title) patch.title = title;
    if (summary !== before.summary) patch.summary = summary;
    if (!sameFields(fields, before.fields)) patch.fields = fields;
    if (Object.keys(patch).length === 0) {
      setStatus((s) => (s === 'dirty' ? 'saved' : s));
      return;
    }

    saved.current = {
      title: patch.title ?? before.title,
      summary: patch.summary ?? before.summary,
      fields: patch.fields ?? before.fields,
    };
    setStatus('saving');
    queue.current = queue.current
      .then(() => patchEntry(entry.id, patch))
      .then((stored) => {
        storeEntry(client, bookId, stored);
        setStatus(isDirty(latest.current, saved.current) ? 'dirty' : 'saved');
      })
      .catch((error: Error) => {
        // Forget what was "saved" so the next flush tries the same change again.
        saved.current = { ...saved.current, ...before };
        setStatus('error');
        reportCodexError(t('codex.editor.saveFailed'))(error);
      });
  }, [bookId, client, entry.id, t]);

  const change = (next: Draft, immediate = false) => {
    latest.current = next;
    setDraft(next);
    setStatus((s) => (s === 'saving' || s === 'error' ? s : 'dirty'));
    if (immediate) flush();
  };

  // Debounced save while typing.
  useEffect(() => {
    const timer = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, flush]);

  // Save what is pending when leaving the entry or hiding the tab.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  const setField = (key: string, patch: Partial<CodexField>) =>
    change({
      ...latest.current,
      fields: latest.current.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    });

  const addField = () => {
    const label = newLabel.trim();
    if (!label) return;
    const fields = latest.current.fields;
    change(
      {
        ...latest.current,
        fields: [
          ...fields,
          {
            key: newFieldKey(fields, () => crypto.randomUUID()),
            label,
            type: newType,
            value: '',
          },
        ],
      },
      true,
    );
    setNewLabel('');
  };

  const setImage = async (file: File | null) => {
    setUploading(true);
    try {
      const imageAssetId = file ? (await uploadEntryImage(bookId, file)).id : null;
      storeEntry(client, bookId, await patchEntry(entry.id, { imageAssetId }));
    } catch (error) {
      reportCodexError(
        file ? t('codex.editor.imageAddFailed') : t('codex.editor.imageRemoveFailed'),
      )(error as Error);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const deleteEntry = () => {
    discarded.current = true;
    remove.mutate(entry.id, {
      onSuccess: () => navigate(`/book/${bookId}/codex`),
      onError: (error) => {
        discarded.current = false;
        reportCodexError(t('codex.editor.deleteFailed'))(error);
      },
    });
  };

  const fields = draft.fields;
  return (
    <div
      className={styles.editor}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) flush();
      }}
    >
      <div className={styles.editorTop}>
        <Link className={styles.back} to={`/book/${bookId}/codex`}>
          <ArrowLeft size={14} /> {category?.name ?? t('codex.title')}
        </Link>
        <span
          className={`${styles.status} ${status === 'error' ? styles.statusError : ''}`}
          role="status"
          data-testid="entry-status"
        >
          {t(STATUS_LABEL_KEYS[status])}
        </span>
      </div>

      <input
        className={styles.titleInput}
        aria-label={t('codex.editor.titleLabel')}
        maxLength={CODEX_TITLE_MAX}
        value={draft.title}
        onChange={(e) => change({ ...draft, title: e.target.value })}
        onBlur={() => draft.title.trim() === '' && change({ ...draft, title: saved.current.title })}
      />

      <div className={styles.head}>
        <div className={styles.portrait}>
          <div className={styles.portraitImage}>
            {entry.imageUrl ? (
              <img src={entry.imageUrl} alt={t('codex.editor.imageAlt', { title: entry.title })} />
            ) : (
              <span>{t('codex.editor.noImage')}</span>
            )}
          </div>
          <div className={styles.portraitActions}>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              aria-label={t('codex.editor.imageFileLabel')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void setImage(file);
              }}
            />
            <Button disabled={uploading} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={16} />{' '}
              {entry.imageUrl ? t('codex.editor.replaceImage') : t('codex.editor.addImage')}
            </Button>
            {entry.imageUrl ? (
              <Button disabled={uploading} onClick={() => void setImage(null)}>
                {t('common.remove')}
              </Button>
            ) : null}
          </div>
        </div>
        <label className={`${uiStyles.field} ${styles.headFields}`}>
          <span>{t('codex.editor.summary')}</span>
          <textarea
            className={uiStyles.input}
            rows={5}
            maxLength={CODEX_SUMMARY_MAX}
            value={draft.summary}
            onChange={(e) => change({ ...draft, summary: e.target.value })}
          />
        </label>
      </div>

      <ul className={styles.fields} aria-label={t('codex.editor.fields')}>
        {fields.map((field, index) => (
          <li key={field.key}>
            <div className={styles.fieldHead}>
              <input
                className={styles.fieldName}
                aria-label={t('codex.editor.fieldNameLabel', { number: index + 1 })}
                maxLength={CODEX_LABEL_MAX}
                value={field.label}
                onChange={(e) => setField(field.key, { label: e.target.value })}
                onBlur={() =>
                  field.label.trim() === '' &&
                  setField(field.key, {
                    label:
                      saved.current.fields.find((f) => f.key === field.key)?.label ?? field.key,
                  })
                }
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('codex.editor.moveFieldUp', { name: field.label })}
                disabled={index === 0}
                onClick={() =>
                  change({ ...draft, fields: moveItem(draft.fields, index, -1) }, true)
                }
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('codex.editor.moveFieldDown', { name: field.label })}
                disabled={index === fields.length - 1}
                onClick={() => change({ ...draft, fields: moveItem(draft.fields, index, 1) }, true)}
              >
                <ArrowDown size={14} />
              </button>
              {removingKey === field.key ? (
                <span className={styles.confirmRemove}>
                  {t('codex.editor.removeFieldConfirm')}
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRemovingKey(null);
                      change(
                        { ...draft, fields: draft.fields.filter((f) => f.key !== field.key) },
                        true,
                      );
                    }}
                  >
                    {t('common.remove')}
                  </Button>
                  <Button onClick={() => setRemovingKey(null)}>{t('codex.editor.keep')}</Button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t('codex.editor.removeField', { name: field.label })}
                  onClick={() => setRemovingKey(field.key)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {field.type === 'longtext' ? (
              <textarea
                className={styles.fieldValue}
                aria-label={field.label}
                rows={4}
                maxLength={CODEX_VALUE_MAX}
                value={field.value}
                onChange={(e) => setField(field.key, { value: e.target.value })}
              />
            ) : (
              <input
                className={styles.fieldValue}
                aria-label={field.label}
                maxLength={CODEX_VALUE_MAX}
                value={field.value}
                onChange={(e) => setField(field.key, { value: e.target.value })}
              />
            )}
          </li>
        ))}
      </ul>

      <form
        className={styles.addField}
        onSubmit={(e) => {
          e.preventDefault();
          addField();
        }}
      >
        <input
          className={uiStyles.input}
          aria-label={t('codex.editor.newFieldName')}
          placeholder={t('codex.editor.newFieldName')}
          maxLength={CODEX_LABEL_MAX}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <select
          className={`${uiStyles.input} ${styles.typeSelect}`}
          aria-label={t('codex.editor.newFieldType')}
          value={newType}
          onChange={(e) => setNewType(e.target.value as CodexFieldType)}
        >
          {CODEX_FIELD_TYPES.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {t(FIELD_TYPE_LABEL_KEYS[fieldType])}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!newLabel.trim() || fields.length >= CODEX_MAX_FIELDS}>
          {t('codex.editor.addField')}
        </Button>
      </form>

      <div className={styles.dangerZone}>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          {t('codex.editor.deleteEntry')}
        </Button>
      </div>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('codex.editor.deleteTitle')}
        description={t('codex.editor.deleteDescription', { title: entry.title })}
      >
        <div className={styles.dialogActions}>
          <Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={deleteEntry} disabled={remove.isPending}>
            {t('codex.editor.deleteEntry')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

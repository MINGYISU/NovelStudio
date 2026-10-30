import { useState, type FormEvent } from 'react';
import {
  DEFAULT_THREAD_COLOR,
  FORESHADOW_STATUSES,
  THREAD_TEXT_MAX,
  THREAD_TITLE_MAX,
  type Thread,
} from '../../../shared/schemas/foreshadow.ts';
import { useCreateThread, useUpdateThread } from '../../api/foreshadows.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import styles from './foreshadow.module.css';
import { statusLabel } from './labels.ts';

interface ThreadDialogProps {
  bookId: string;
  /** Omit to create a thread. */
  thread?: Thread;
  onClose: () => void;
}

export function ThreadDialog({ bookId, thread, onClose }: ThreadDialogProps) {
  const t = useT();
  const create = useCreateThread(bookId);
  const update = useUpdateThread(bookId);
  const [title, setTitle] = useState(thread?.title ?? '');
  const [status, setStatus] = useState(thread?.status ?? 'planned');
  const [color, setColor] = useState(thread?.color ?? DEFAULT_THREAD_COLOR);
  const [description, setDescription] = useState(thread?.description ?? '');
  const [notes, setNotes] = useState(thread?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { title, status, color, description, notes };
    const done = { onSuccess: onClose, onError: (e: Error) => setError(apiErrorMessage(e)) };
    if (thread) update.mutate({ id: thread.id, patch: body }, done);
    else create.mutate(body, done);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        thread ? t('foreshadow.threadDialog.editTitle') : t('foreshadow.threadDialog.newTitle')
      }
    >
      <form onSubmit={submit}>
        <Field label={t('foreshadow.threadDialog.title')}>
          <input
            className={uiStyles.input}
            value={title}
            maxLength={THREAD_TITLE_MAX}
            required
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className={styles.formRow}>
          <Field label={t('foreshadow.threadDialog.status')}>
            <select
              className={uiStyles.input}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {FORESHADOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(t, s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('foreshadow.threadDialog.color')}>
            <input
              className={`${uiStyles.input} ${styles.colorInput}`}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('foreshadow.threadDialog.description')}>
          <textarea
            className={uiStyles.input}
            rows={3}
            value={description}
            maxLength={THREAD_TEXT_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label={t('foreshadow.threadDialog.notes')}>
          <textarea
            className={uiStyles.input}
            rows={3}
            value={notes}
            maxLength={THREAD_TEXT_MAX}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy || title.trim() === ''}>
            {thread ? t('common.save') : t('foreshadow.threadDialog.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

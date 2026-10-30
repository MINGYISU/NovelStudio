import { useState, type FormEvent } from 'react';
import {
  OCCURRENCE_TEXT_MAX,
  ROLE_GLYPHS,
  THREAD_TITLE_MAX,
  type OccurrenceRole,
} from '../../../shared/schemas/foreshadow.ts';
import { useAddOccurrence, useCreateThread, useThreads } from '../../api/foreshadows.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';

const NEW_THREAD = '';

interface MarkAnchorDialogProps {
  bookId: string;
  nodeId: string;
  role: OccurrenceRole;
  /** The selected text; it becomes the occurrence's excerpt. */
  text: string;
  /** Called with the new occurrence's id once it exists; the caller puts the mark on the text. */
  onMarked: (occurrenceId: string) => void;
  onClose: () => void;
}

/** FS-08: pick or create the thread for the selected text, then record the occurrence. */
export function MarkAnchorDialog({
  bookId,
  nodeId,
  role,
  text,
  onMarked,
  onClose,
}: MarkAnchorDialogProps) {
  const t = useT();
  const threads = useThreads(bookId);
  const createThread = useCreateThread(bookId);
  const addOccurrence = useAddOccurrence(bookId);
  const [choice, setChoice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existing = threads.data ?? [];
  const selected = choice ?? existing[0]?.id ?? NEW_THREAD;
  const creating = selected === NEW_THREAD;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const threadId = creating ? (await createThread.mutateAsync({ title })).id : selected;
      const thread = await addOccurrence.mutateAsync({
        threadId,
        body: {
          nodeId,
          role,
          excerpt: text.replace(/\s+/g, ' ').trim().slice(0, OCCURRENCE_TEXT_MAX),
        },
      });
      const occurrence = thread.occurrences.at(-1);
      if (!occurrence) throw new Error(t('foreshadow.markAnchor.notCreated'));
      onMarked(occurrence.id);
    } catch (e) {
      setError(e instanceof Error ? apiErrorMessage(e) : t('foreshadow.markAnchor.failed'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title={t('foreshadow.markAnchor.title', { role: t(`foreshadow.roleLower.${role}`) })}
      description={t('foreshadow.markAnchor.description', {
        glyph: ROLE_GLYPHS[role],
        role: t(`foreshadow.roleLower.${role}`),
      })}
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field label={t('foreshadow.markAnchor.thread')}>
          <select
            className={uiStyles.input}
            value={selected}
            onChange={(e) => setChoice(e.target.value)}
          >
            {existing.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
            <option value={NEW_THREAD}>{t('foreshadow.markAnchor.newThreadOption')}</option>
          </select>
        </Field>
        {creating ? (
          <Field label={t('foreshadow.markAnchor.newThreadTitle')}>
            <input
              className={uiStyles.input}
              value={title}
              maxLength={THREAD_TITLE_MAX}
              required
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        ) : null}
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || threads.isPending}>
            {t('foreshadow.markAnchor.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

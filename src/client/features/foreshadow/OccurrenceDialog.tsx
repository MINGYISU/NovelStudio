import { useState, type FormEvent } from 'react';
import {
  OCCURRENCE_ROLES,
  OCCURRENCE_TEXT_MAX,
  ROLE_GLYPHS,
  ROLE_LABELS,
  type Occurrence,
  type OccurrenceRole,
  type Thread,
} from '../../../shared/schemas/foreshadow.ts';
import { useAddOccurrence, useUpdateOccurrence } from '../../api/foreshadows.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import styles from './foreshadow.module.css';
import type { SectionOption } from './sections.ts';

interface OccurrenceDialogProps {
  bookId: string;
  thread: Thread;
  /** Omit to add an occurrence. */
  occurrence?: Occurrence;
  options: readonly SectionOption[];
  defaultNodeId?: string;
  onClose: () => void;
}

export function OccurrenceDialog({
  bookId,
  thread,
  occurrence,
  options,
  defaultNodeId,
  onClose,
}: OccurrenceDialogProps) {
  const add = useAddOccurrence(bookId);
  const update = useUpdateOccurrence(bookId);
  const [nodeId, setNodeId] = useState(occurrence?.nodeId ?? defaultNodeId ?? options[0]?.id ?? '');
  const [role, setRole] = useState<OccurrenceRole>(occurrence?.role ?? 'setup');
  const [excerpt, setExcerpt] = useState(occurrence?.excerpt ?? '');
  const [note, setNote] = useState(occurrence?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = add.isPending || update.isPending;
  // An occurrence in a trashed section keeps its old target until the user picks a live one.
  const keepsOldTarget = occurrence !== undefined && nodeId === occurrence.nodeId;
  // While its marked text exists, that text decides the section (FS-08).
  const followsAnchor = occurrence?.anchorState === 'present';
  const pickable = nodeId !== '' && (keepsOldTarget || options.some((o) => o.id === nodeId));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const done = { onSuccess: onClose, onError: (e: Error) => setError(e.message) };
    if (occurrence) {
      update.mutate(
        {
          id: occurrence.id,
          patch: { role, excerpt, note, ...(keepsOldTarget ? {} : { nodeId }) },
        },
        done,
      );
    } else {
      add.mutate({ threadId: thread.id, body: { nodeId, role, excerpt, note } }, done);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={occurrence ? 'Edit occurrence' : 'Add occurrence'}
      description={`Thread: ${thread.title}`}
    >
      <form onSubmit={submit}>
        <Field label="Section">
          <select
            className={uiStyles.input}
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            disabled={followsAnchor}
            required
          >
            {keepsOldTarget && !options.some((o) => o.id === nodeId) ? (
              <option value={nodeId}>(current section: in the trash or missing)</option>
            ) : null}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {'\u00a0\u00a0'.repeat(o.depth)}
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {followsAnchor ? (
          <p className={styles.empty}>
            This occurrence follows its marked text. Move the text to change its section.
          </p>
        ) : null}
        <Field label="Role">
          <select
            className={uiStyles.input}
            value={role}
            onChange={(e) => setRole(e.target.value as OccurrenceRole)}
          >
            {OCCURRENCE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_GLYPHS[r]} {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Excerpt (quoted text, optional)">
          <textarea
            className={uiStyles.input}
            rows={3}
            value={excerpt}
            maxLength={OCCURRENCE_TEXT_MAX}
            onChange={(e) => setExcerpt(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)">
          <textarea
            className={`${uiStyles.input} ${styles.noteInput}`}
            rows={2}
            value={note}
            maxLength={OCCURRENCE_TEXT_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !pickable}>
            {occurrence ? 'Save' : 'Add occurrence'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

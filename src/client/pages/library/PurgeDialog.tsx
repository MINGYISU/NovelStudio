import { useState, type FormEvent } from 'react';
import { usePurgeBook } from '../../api/books.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import type { Book } from '../../../shared/schemas/book.ts';
import styles from './library.module.css';

/** Permanent deletion needs the exact title typed in (LIB-06). */
export function PurgeDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const purge = usePurgeBook();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (typed !== book.title) return;
    purge.mutate({ id: book.id, confirmTitle: typed }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Delete permanently">
      <form onSubmit={submit}>
        <p>
          This deletes <span className={styles.confirmTitle}>{book.title}</span>, all of its
          sections and its images. It cannot be undone.
        </p>
        <Field label="Type the exact title to confirm">
          <input
            className={uiStyles.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <FormError message={purge.error?.message ?? null} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={typed !== book.title || purge.isPending}>
            Delete permanently
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

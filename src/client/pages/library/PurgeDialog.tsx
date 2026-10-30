import { useState, type FormEvent } from 'react';
import { usePurgeBook } from '../../api/books.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import type { Book } from '../../../shared/schemas/book.ts';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import styles from './library.module.css';

/** Permanent deletion needs the exact title typed in (LIB-06). */
export function PurgeDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const purge = usePurgeBook();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (typed !== book.title) return;
    purge.mutate({ id: book.id, confirmTitle: typed }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('library.purge.title')}>
      <form onSubmit={submit}>
        <p>
          {t('library.purge.warningBefore')}
          <span className={styles.confirmTitle}>{book.title}</span>
          {t('library.purge.warningAfter')}
        </p>
        <Field label={t('library.purge.confirmField')}>
          <input
            className={uiStyles.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <FormError message={purge.error ? apiErrorMessage(purge.error) : null} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="danger" disabled={typed !== book.title || purge.isPending}>
            {t('library.purge.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

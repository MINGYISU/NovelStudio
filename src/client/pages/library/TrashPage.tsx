import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useBooks, useRestoreBook } from '../../api/books.ts';
import { Button } from '../../components/ui.tsx';
import type { Book } from '../../../shared/schemas/book.ts';
import { apiErrorMessage, formatDate, useT } from '../../i18n/index.ts';
import { BookCover } from './BookCover.tsx';
import styles from './library.module.css';
import { PurgeDialog } from './PurgeDialog.tsx';

function TrashedBook({ book }: { book: Book }) {
  const t = useT();
  const restore = useRestoreBook();
  const [purging, setPurging] = useState(false);

  return (
    <li className={styles.card}>
      <BookCover book={book} />
      <h2 className={styles.cardTitle}>{book.title}</h2>
      <p className={styles.meta}>
        {t('library.trashPage.trashed', { date: book.deletedAt ? formatDate(book.deletedAt) : '' })}
      </p>
      <div className={styles.trashActions}>
        <Button onClick={() => restore.mutate(book.id)} disabled={restore.isPending}>
          {t('common.restore')}
        </Button>
        <Button onClick={() => setPurging(true)}>{t('library.trashPage.deletePermanently')}</Button>
      </div>
      {restore.error ? (
        <p className={styles.error} role="alert">
          {apiErrorMessage(restore.error)}
        </p>
      ) : null}
      {purging ? <PurgeDialog book={book} onClose={() => setPurging(false)} /> : null}
    </li>
  );
}

export function TrashPage() {
  const t = useT();
  const books = useBooks({ sort: 'modified', trashed: true });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('library.trashPage.title')}</h1>
        <Link className={styles.sort} to="/">
          <ArrowLeft size={16} /> {t('library.trashPage.back')}
        </Link>
      </header>

      {books.isPending ? <p className={styles.empty}>{t('common.loading')}</p> : null}
      {books.error ? (
        <p className={`${styles.empty} ${styles.error}`} role="alert">
          {apiErrorMessage(books.error)}
        </p>
      ) : null}
      {books.data && books.data.length === 0 ? (
        <p className={styles.empty}>{t('library.trashPage.empty')}</p>
      ) : null}
      {books.data && books.data.length > 0 ? (
        <ul className={styles.grid}>
          {books.data.map((book) => (
            <TrashedBook key={book.id} book={book} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}

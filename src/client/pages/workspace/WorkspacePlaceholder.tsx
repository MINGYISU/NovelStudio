import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useBook } from '../../api/books.ts';
import styles from '../library/library.module.css';

/** M1 placeholder: the real workspace (sidebar, editor) arrives in later milestones. */
export function WorkspacePlaceholder() {
  const { bookId } = useParams();
  const book = useBook(bookId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.sort} to="/">
          <ArrowLeft size={16} /> Library
        </Link>
      </header>
      {book.isPending ? <p className={styles.empty}>Loading…</p> : null}
      {book.error ? (
        <p className={`${styles.empty} ${styles.error}`} role="alert">
          This book could not be opened.
        </p>
      ) : null}
      {book.data ? (
        <>
          <h1 className={styles.heading}>{book.data.title}</h1>
          <p className={styles.empty}>
            {book.data.deletedAt
              ? 'This book is in the trash. Restore it from the library to open it.'
              : 'The workspace is empty for now. The manuscript tree and editor arrive in later milestones.'}
          </p>
        </>
      ) : null}
    </main>
  );
}

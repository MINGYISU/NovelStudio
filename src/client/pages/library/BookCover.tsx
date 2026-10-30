import type { Book } from '../../../shared/schemas/book.ts';
import { coverColors } from '../../../shared/cover-color.ts';
import { useT } from '../../i18n/index.ts';
import styles from './library.module.css';

interface BookCoverProps {
  book: Pick<Book, 'id' | 'title' | 'coverUrl'>;
  /** Overrides the stored cover, e.g. a local preview. */
  previewUrl?: string | null;
}

/** The uploaded cover, or a generated one: the title on a colour derived from the book ID (LIB-04). */
export function BookCover({ book, previewUrl }: BookCoverProps) {
  const t = useT();
  const url = previewUrl === undefined ? book.coverUrl : previewUrl;
  if (url)
    return (
      <img className={styles.cover} src={url} alt={t('library.cover.alt', { title: book.title })} />
    );
  const { background, foreground } = coverColors(book.id);
  return (
    <div
      className={`${styles.cover} ${styles.generated}`}
      style={{ background, color: foreground }}
      role="img"
      aria-label={t('library.cover.generatedLabel', { title: book.title })}
    >
      {book.title}
    </div>
  );
}

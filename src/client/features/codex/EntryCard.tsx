import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { CodexEntry } from '../../../shared/schemas/codex.ts';
import { useT } from '../../i18n/index.ts';
import styles from './codex.module.css';

interface EntryCardProps {
  entry: CodexEntry;
  /** Shown in search results, where cards from several categories mix. */
  categoryName?: string;
  /** Reordering is offered only inside a category; omit to hide the buttons. */
  onMove?: (delta: -1 | 1) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

/** CDX-05: image, title and summary of one entry. */
export function EntryCard({ entry, categoryName, onMove, isFirst, isLast }: EntryCardProps) {
  const t = useT();
  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/book/${entry.bookId}/codex/${entry.id}`}>
        <div className={styles.cardImage}>
          {entry.imageUrl ? (
            <img src={entry.imageUrl} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">{Array.from(entry.title)[0] ?? '?'}</span>
          )}
        </div>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{entry.title}</h3>
          {categoryName ? <p className={styles.cardCategory}>{categoryName}</p> : null}
          {entry.summary ? <p className={styles.cardSummary}>{entry.summary}</p> : null}
        </div>
      </Link>
      {onMove ? (
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('codex.entryCard.moveEarlier', { title: entry.title })}
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('codex.entryCard.moveLater', { title: entry.title })}
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </li>
  );
}

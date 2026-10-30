import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { exportUrl, useTrashBook } from '../../api/books.ts';
import type { Book } from '../../../shared/schemas/book.ts';
import { isBackupOverdue } from '../../../shared/cold-backup.ts';
import { triggerDownload, useExportGuard } from '../../features/settings/export-guard.tsx';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { apiErrorMessage, formatDate, formatWords, useT } from '../../i18n/index.ts';
import { BookCover } from './BookCover.tsx';
import { EditBookDialog } from './BookDialogs.tsx';
import styles from './library.module.css';

export interface BackupInfo {
  lastAt: string | undefined;
  reminderDays: number;
}

/** Cold backup reminder (LIB-08): amber when the last backup is older than the threshold or missing. */
function BackupBadge({ info }: { info: BackupInfo }) {
  const t = useT();
  const overdue = isBackupOverdue(info.lastAt, new Date(), info.reminderDays);
  return (
    <span
      className={`${styles.badge} ${overdue ? styles.badgeWarn : ''}`}
      data-testid="backup-badge"
    >
      {info.lastAt
        ? t('library.bookCard.backedUp', { date: formatDate(info.lastAt) })
        : t('library.bookCard.neverBackedUp')}
    </span>
  );
}

export function BookCard({ book, backup }: { book: Book; backup?: BackupInfo }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const trash = useTrashBook();
  const { guard, element: exportGuard } = useExportGuard();

  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/book/${book.id}/manuscript`}>
        <BookCover book={book} />
        <h2 className={styles.cardTitle}>{book.title}</h2>
        {book.author ? <p className={styles.meta}>{book.author}</p> : null}
        <p className={styles.meta}>
          {formatDate(book.updatedAt)} · {formatWords(book.wordCount)}
        </p>
        {backup ? <BackupBadge info={backup} /> : null}
      </Link>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={styles.menuButton}
          aria-label={t('library.bookCard.menuFor', { title: book.title })}
        >
          <MoreHorizontal size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => setEditing(true)}>
              <Pencil size={16} /> {t('library.bookCard.editMetadata')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => guard(false, () => triggerDownload(exportUrl(book.id, 'md')))}
            >
              <FileText size={16} /> {t('library.bookCard.exportMarkdown')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => guard(false, () => triggerDownload(exportUrl(book.id, 'txt')))}
            >
              <FileText size={16} /> {t('library.bookCard.exportText')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => setExporting(true)}>
              <Download size={16} /> {t('library.bookCard.exportColdBackup')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => trash.mutate(book.id)}>
              <Trash2 size={16} /> {t('library.bookCard.moveToTrash')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {trash.error ? (
        <p className={styles.error} role="alert">
          {apiErrorMessage(trash.error)}
        </p>
      ) : null}
      {exportGuard}
      {editing ? <EditBookDialog book={book} onClose={() => setEditing(false)} /> : null}
      {exporting ? (
        <ExportDialog
          scope={{ kind: 'book', bookId: book.id, title: book.title }}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </li>
  );
}

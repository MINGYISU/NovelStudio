import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTrashBook } from '../../api/books.ts';
import type { Book } from '../../../shared/schemas/book.ts';
import { isBackupOverdue } from '../../../shared/cold-backup.ts';
import { triggerDownload, useExportGuard } from '../../features/settings/export-guard.tsx';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { BookCover } from './BookCover.tsx';
import { EditBookDialog } from './BookDialogs.tsx';
import { formatDate, formatWords } from './format.ts';
import styles from './library.module.css';

export interface BackupInfo {
  lastAt: string | undefined;
  reminderDays: number;
}

/** Cold backup reminder (LIB-08): amber when the last backup is older than the threshold or missing. */
function BackupBadge({ info }: { info: BackupInfo }) {
  const overdue = isBackupOverdue(info.lastAt, new Date(), info.reminderDays);
  return (
    <span
      className={`${styles.badge} ${overdue ? styles.badgeWarn : ''}`}
      data-testid="backup-badge"
    >
      {info.lastAt ? `Backed up ${formatDate(info.lastAt)}` : 'Never backed up'}
    </span>
  );
}

export function BookCard({ book, backup }: { book: Book; backup?: BackupInfo }) {
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
        <DropdownMenu.Trigger className={styles.menuButton} aria-label={`Menu for ${book.title}`}>
          <MoreHorizontal size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => setEditing(true)}>
              <Pencil size={16} /> Edit metadata
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() =>
                guard(false, () => triggerDownload(`/api/books/${book.id}/export?format=md`))
              }
            >
              <FileText size={16} /> Export Markdown
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() =>
                guard(false, () => triggerDownload(`/api/books/${book.id}/export?format=txt`))
              }
            >
              <FileText size={16} /> Export plain text
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => setExporting(true)}>
              <Download size={16} /> Export cold backup…
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => trash.mutate(book.id)}>
              <Trash2 size={16} /> Move to trash
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {trash.error ? (
        <p className={styles.error} role="alert">
          {trash.error.message}
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

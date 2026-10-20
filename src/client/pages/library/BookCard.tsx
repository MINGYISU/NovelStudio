import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTrashBook } from '../../api/books.ts';
import type { Book } from '../../../shared/schemas/book.ts';
import { BookCover } from './BookCover.tsx';
import { EditBookDialog } from './BookDialogs.tsx';
import { formatDate, formatWords } from './format.ts';
import styles from './library.module.css';

export function BookCard({ book }: { book: Book }) {
  const [editing, setEditing] = useState(false);
  const trash = useTrashBook();

  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/book/${book.id}/manuscript`}>
        <BookCover book={book} />
        <h2 className={styles.cardTitle}>{book.title}</h2>
        {book.author ? <p className={styles.meta}>{book.author}</p> : null}
        <p className={styles.meta}>
          {formatDate(book.updatedAt)} · {formatWords(book.wordCount)}
        </p>
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
      {editing ? <EditBookDialog book={book} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}

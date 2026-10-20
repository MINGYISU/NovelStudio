import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useBooks } from '../../api/books.ts';
import { Button } from '../../components/ui.tsx';
import { bookSortSchema, type BookSort } from '../../../shared/schemas/book.ts';
import { BookCard } from './BookCard.tsx';
import { CreateBookDialog } from './BookDialogs.tsx';
import styles from './library.module.css';

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const sort: BookSort = bookSortSchema.catch('modified').parse(params.get('sort'));
  const books = useBooks({ sort, trashed: false });
  const [creating, setCreating] = useState(false);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Library</h1>
        <label className={styles.sort}>
          Sort by
          <select
            className={styles.select}
            value={sort}
            onChange={(e) =>
              setParams(e.target.value === 'modified' ? {} : { sort: e.target.value })
            }
          >
            <option value="modified">Last modified</option>
            <option value="title">Title</option>
          </select>
        </label>
        <Link className={styles.sort} to="/trash">
          <Trash2 size={16} /> Trash
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary">
              <Plus size={16} /> New
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => setCreating(true)}>
                Create blank…
              </DropdownMenu.Item>
              <DropdownMenu.Item className={styles.menuItem} disabled>
                Import… (coming later)
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {books.isPending ? <p className={styles.empty}>Loading…</p> : null}
      {books.error ? (
        <p className={`${styles.empty} ${styles.error}`} role="alert">
          {books.error.message}
        </p>
      ) : null}
      {books.data && books.data.length === 0 ? (
        <p className={styles.empty}>No books yet. Use New to create your first one.</p>
      ) : null}
      {books.data && books.data.length > 0 ? (
        <ul className={styles.grid}>
          {books.data.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </ul>
      ) : null}

      {creating ? <CreateBookDialog onClose={() => setCreating(false)} /> : null}
    </main>
  );
}

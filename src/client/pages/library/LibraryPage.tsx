import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Plus, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useBooks } from '../../api/books.ts';
import { useColdBackupSettings } from '../../api/cold-backup.ts';
import { Button } from '../../components/ui.tsx';
import { bookSortSchema, type BookSort } from '../../../shared/schemas/book.ts';
import { BookCard } from './BookCard.tsx';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { ImportDialog } from '../../features/settings/ImportDialog.tsx';
import { TextImportDialog } from '../../features/settings/TextImportDialog.tsx';
import { CreateBookDialog } from './BookDialogs.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import styles from './library.module.css';

export function LibraryPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const sort: BookSort = bookSortSchema.catch('modified').parse(params.get('sort'));
  const books = useBooks({ sort, trashed: false });
  const backups = useColdBackupSettings();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingText, setImportingText] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('library.title')}</h1>
        <label className={styles.sort}>
          {t('library.sortBy')}
          <select
            className={styles.select}
            value={sort}
            onChange={(e) =>
              setParams(e.target.value === 'modified' ? {} : { sort: e.target.value })
            }
          >
            <option value="modified">{t('library.sort.modified')}</option>
            <option value="title">{t('library.sort.title')}</option>
          </select>
        </label>
        <Link className={styles.sort} to="/trash">
          <Trash2 size={16} /> {t('library.trash')}
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary">
              <Plus size={16} /> {t('library.new')}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => setCreating(true)}>
                {t('library.createBlank')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={styles.menuItem}
                onSelect={() => setImportingText(true)}
              >
                {t('library.importText')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => setImporting(true)}>
                {t('library.importColdBackup')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.menuButtonInline} aria-label={t('library.menu')}>
            <MoreHorizontal size={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => setExportingAll(true)}>
                {t('library.exportAll')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={styles.menuItem} asChild>
                <Link to="/settings">
                  <Settings size={16} /> {t('library.settings')}
                </Link>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {books.isPending ? <p className={styles.empty}>{t('common.loading')}</p> : null}
      {books.error ? (
        <p className={`${styles.empty} ${styles.error}`} role="alert">
          {apiErrorMessage(books.error)}
        </p>
      ) : null}
      {books.data && books.data.length === 0 ? (
        <p className={styles.empty}>{t('library.empty')}</p>
      ) : null}
      {books.data && books.data.length > 0 ? (
        <ul className={styles.grid}>
          {books.data.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              backup={
                backups.data
                  ? {
                      lastAt: backups.data.last[book.id]?.at,
                      reminderDays: backups.data.settings.reminderDays,
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      ) : null}

      {creating ? <CreateBookDialog onClose={() => setCreating(false)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {importingText ? <TextImportDialog onClose={() => setImportingText(false)} /> : null}
      {exportingAll ? (
        <ExportDialog scope={{ kind: 'all' }} onClose={() => setExportingAll(false)} />
      ) : null}
    </main>
  );
}

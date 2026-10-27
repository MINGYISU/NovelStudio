import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { searchEntries } from '../../../shared/codex.ts';
import type { CodexCategory, CodexEntry } from '../../../shared/schemas/codex.ts';
import { useCodex, useSeedCodex } from '../../api/codex.ts';
import { Button, uiStyles } from '../../components/ui.tsx';
import { CategoryList } from './CategoryList.tsx';
import styles from './codex.module.css';
import { EntryCard } from './EntryCard.tsx';
import { EntryEditor } from './EntryEditor.tsx';
import { reportCodexError } from './errors.ts';
import { EntryGrid } from './EntryGrid.tsx';

const NONE: CodexCategory[] = [];
const NONE_ENTRIES: CodexEntry[] = [];

interface CodexViewProps {
  bookId: string;
  entryId: string | undefined;
}

/** The Codex view: categories on the left, cards or the entry editor on the right, search on top. */
export function CodexView({ bookId, entryId }: CodexViewProps) {
  const navigate = useNavigate();
  const codex = useCodex(bookId);
  const seed = useSeedCodex(bookId);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [openedEntryId, setOpenedEntryId] = useState<string | undefined>();
  const [query, setQuery] = useState('');

  const data = codex.data;

  const categories = data?.categories ?? NONE;
  const entries = data?.entries ?? NONE_ENTRIES;
  const entry = entryId ? entries.find((e) => e.id === entryId) : undefined;
  // Leaving an entry returns to its own category, not the first one.
  if (entry && entry.id !== openedEntryId) {
    setOpenedEntryId(entry.id);
    setCategoryId(entry.categoryId);
  }
  const activeId = entry?.categoryId ?? categoryId ?? categories[0]?.id;
  const category = categories.find((c) => c.id === activeId);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + 1);
    return map;
  }, [entries]);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);
  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  if (codex.isPending) return <p className={styles.empty}>Loading…</p>;
  if (codex.error || !data) {
    return (
      <p className={styles.empty} role="alert">
        The codex could not be loaded.
      </p>
    );
  }

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setQuery('');
    if (entryId) navigate(`/book/${bookId}/codex`);
  };

  const searching = query.trim() !== '' && !entryId;
  return (
    <div className={styles.codex}>
      <CategoryList
        bookId={bookId}
        categories={categories}
        counts={counts}
        selectedId={activeId}
        onSelect={selectCategory}
      />
      <section className={styles.main} aria-label="Codex">
        <div className={styles.mainHeader}>
          <h2 className={styles.mainTitle}>Codex</h2>
          <div className={styles.search}>
            <Search size={14} />
            <input
              className={uiStyles.input}
              type="search"
              aria-label="Search codex"
              placeholder="Search all entries"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            />
          </div>
        </div>
        {entryId ? (
          entry ? (
            <div className={styles.scroll}>
              <EntryEditor
                key={entry.id}
                bookId={bookId}
                entry={entry}
                category={categories.find((c) => c.id === entry.categoryId)}
              />
            </div>
          ) : (
            <div className={styles.scroll}>
              <p className={styles.empty}>
                This entry no longer exists.{' '}
                <Link to={`/book/${bookId}/codex`}>Back to the codex</Link>
              </p>
            </div>
          )
        ) : searching ? (
          <div className={styles.scroll}>
            {results.length === 0 ? (
              <p className={styles.empty}>No entries match “{query.trim()}”.</p>
            ) : (
              <ul className={styles.grid} aria-label="Search results">
                {results.map((e) => (
                  <EntryCard key={e.id} entry={e} categoryName={names.get(e.categoryId)} />
                ))}
              </ul>
            )}
          </div>
        ) : category ? (
          <EntryGrid
            key={category.id}
            bookId={bookId}
            category={category}
            entries={entries.filter((e) => e.categoryId === category.id)}
          />
        ) : (
          <div className={styles.scroll}>
            {categories.length === 0 ? (
              // CDX-01: defaults come with a new book; an empty Codex stays empty until asked.
              <div className={styles.empty}>
                <p>This book has no Codex categories. Add one, or start from the defaults.</p>
                <Button
                  disabled={seed.isPending}
                  onClick={() =>
                    seed.mutate(undefined, {
                      onError: reportCodexError('The default categories were not created.'),
                    })
                  }
                >
                  Add default categories
                </Button>
              </div>
            ) : (
              <p className={styles.empty}>Add a category to begin.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

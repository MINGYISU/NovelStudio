import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CODEX_TITLE_MAX,
  type CodexCategory,
  type CodexEntry,
} from '../../../shared/schemas/codex.ts';
import { useCreateEntry, useMoveEntry } from '../../api/codex.ts';
import { Button, uiStyles } from '../../components/ui.tsx';
import styles from './codex.module.css';
import { EntryCard } from './EntryCard.tsx';
import { reportCodexError } from './errors.ts';

interface EntryGridProps {
  bookId: string;
  category: CodexCategory;
  entries: CodexEntry[];
}

/** CDX-05: the card grid of one category, with "new entry". */
export function EntryGrid({ bookId, category, entries }: EntryGridProps) {
  const navigate = useNavigate();
  const create = useCreateEntry(bookId);
  const move = useMoveEntry(bookId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const add = () => {
    const name = title.trim();
    if (!name) return;
    create.mutate(
      { categoryId: category.id, title: name },
      {
        onSuccess: (entry) => {
          setAdding(false);
          setTitle('');
          navigate(`/book/${bookId}/codex/${entry.id}`);
        },
        onError: reportCodexError('The entry was not created.'),
      },
    );
  };

  return (
    <div className={styles.scroll}>
      <div className={styles.toolbar}>
        <h2 className={styles.mainTitle}>{category.name}</h2>
        {adding ? (
          <form
            className={styles.newEntry}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              className={uiStyles.input}
              autoFocus
              aria-label="New entry title"
              placeholder="Entry title"
              maxLength={CODEX_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            />
            <Button type="submit" variant="primary" disabled={!title.trim() || create.isPending}>
              Create
            </Button>
          </form>
        ) : (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> New entry
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className={styles.empty}>No entries in {category.name} yet.</p>
      ) : (
        <ul className={styles.grid}>
          {entries.map((entry, index) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              onMove={(delta) =>
                move.mutate(
                  { id: entry.id, categoryId: category.id, index: index + delta },
                  { onError: reportCodexError('The entry was not moved.') },
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

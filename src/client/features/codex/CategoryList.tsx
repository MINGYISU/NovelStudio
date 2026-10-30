import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, ChevronUp, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { CODEX_NAME_MAX, type CodexCategory } from '../../../shared/schemas/codex.ts';
import {
  useCreateCategory,
  useDeleteCategory,
  useMoveCategory,
  useUpdateCategory,
} from '../../api/codex.ts';
import { Button, uiStyles } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.ts';
import libraryStyles from '../../pages/library/library.module.css';
import styles from './codex.module.css';
import { reportCodexError } from './errors.ts';
import { TemplateDialog } from './TemplateDialog.tsx';

interface CategoryListProps {
  bookId: string;
  categories: CodexCategory[];
  counts: Map<string, number>;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/** CDX-01: pick, add, rename, reorder and (when empty) delete categories. */
export function CategoryList({
  bookId,
  categories,
  counts,
  selectedId,
  onSelect,
}: CategoryListProps) {
  const t = useT();
  const create = useCreateCategory(bookId);
  const update = useUpdateCategory(bookId);
  const move = useMoveCategory(bookId);
  const remove = useDeleteCategory(bookId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [templateFor, setTemplateFor] = useState<CodexCategory | null>(null);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(
      { name },
      {
        onSuccess: (category) => {
          setAdding(false);
          setNewName('');
          onSelect(category.id);
        },
        onError: reportCodexError(t('codex.categoryList.addFailed')),
      },
    );
  };

  const finishRename = (category: CodexCategory) => {
    const name = renameText.trim();
    setRenamingId(null);
    if (name && name !== category.name) {
      update.mutate(
        { id: category.id, patch: { name } },
        { onError: reportCodexError(t('codex.categoryList.renameFailed')) },
      );
    }
  };

  return (
    <nav className={styles.categories} aria-label={t('codex.categoryList.label')}>
      <div className={styles.categoriesHeader}>
        <span>{t('codex.categoryList.heading')}</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('codex.categoryList.addCategory')}
          title={t('codex.categoryList.addCategory')}
          onClick={() => setAdding((open) => !open)}
        >
          <Plus size={16} />
        </button>
      </div>
      {adding ? (
        <form
          className={styles.inlineForm}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className={uiStyles.input}
            autoFocus
            aria-label={t('codex.categoryList.newNameLabel')}
            placeholder={t('codex.categoryList.namePlaceholder')}
            maxLength={CODEX_NAME_MAX}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
          <Button type="submit" variant="primary" disabled={!newName.trim() || create.isPending}>
            {t('common.add')}
          </Button>
        </form>
      ) : null}
      {categories.map((category, index) => {
        const count = counts.get(category.id) ?? 0;
        const selected = category.id === selectedId;
        return (
          <div
            key={category.id}
            className={`${styles.categoryRow} ${selected ? styles.categoryRowSelected : ''}`}
          >
            {renamingId === category.id ? (
              <input
                className={uiStyles.input}
                autoFocus
                aria-label={t('codex.categoryList.renameLabel', { name: category.name })}
                maxLength={CODEX_NAME_MAX}
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => finishRename(category)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.categoryButton}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(category.id)}
              >
                <span className={styles.categoryName} data-testid="category-name">
                  {category.name}
                </span>
                <span className={styles.count}>{count}</span>
              </button>
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                className={styles.iconButton}
                aria-label={t('codex.categoryList.menuLabel', { name: category.name })}
              >
                <MoreHorizontal size={16} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className={libraryStyles.menu} align="end" sideOffset={4}>
                  <DropdownMenu.Item
                    className={libraryStyles.menuItem}
                    onSelect={() => {
                      setRenameText(category.name);
                      setRenamingId(category.id);
                    }}
                  >
                    {t('common.rename')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={libraryStyles.menuItem}
                    onSelect={() => setTemplateFor(category)}
                  >
                    {t('codex.categoryList.editTemplate')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={libraryStyles.menuItem}
                    disabled={index === 0}
                    onSelect={() =>
                      move.mutate(
                        { id: category.id, index: index - 1 },
                        { onError: reportCodexError(t('codex.categoryList.moveFailed')) },
                      )
                    }
                  >
                    <ChevronUp size={16} /> {t('codex.categoryList.moveUp')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={libraryStyles.menuItem}
                    disabled={index === categories.length - 1}
                    onSelect={() =>
                      move.mutate(
                        { id: category.id, index: index + 1 },
                        { onError: reportCodexError(t('codex.categoryList.moveFailed')) },
                      )
                    }
                  >
                    <ChevronDown size={16} /> {t('codex.categoryList.moveDown')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={libraryStyles.menuItem}
                    disabled={count > 0}
                    onSelect={() =>
                      remove.mutate(category.id, {
                        onError: reportCodexError(t('codex.categoryList.deleteFailed')),
                      })
                    }
                  >
                    {t('codex.categoryList.delete')}
                  </DropdownMenu.Item>
                  {count > 0 ? (
                    <div className={styles.menuHint}>
                      {t('codex.categoryList.onlyEmptyDeletable')}
                    </div>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        );
      })}
      {templateFor ? (
        <TemplateDialog
          key={templateFor.id}
          bookId={bookId}
          category={templateFor}
          onClose={() => setTemplateFor(null)}
        />
      ) : null}
    </nav>
  );
}

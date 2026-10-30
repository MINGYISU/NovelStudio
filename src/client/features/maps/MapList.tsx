import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import {
  MAP_TEMPLATES,
  MAP_TITLE_MAX,
  type MapTemplate,
  type StoryMap,
} from '../../../shared/schemas/map.ts';
import { useCreateMap, useDeleteMap, useDuplicateMap, useRenameMap } from '../../api/maps.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import libraryStyles from '../../pages/library/library.module.css';
import { mapSavers } from './map-saver.ts';
import styles from './maps.module.css';

const notifyError = (message: string) =>
  useWorkspaceStore.getState().notify({ tone: 'error', message });

function NewMapDialog({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreateMap(bookId);
  const [template, setTemplate] = useState<MapTemplate>('plot-tree');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    create.mutate(
      { template, title: title.trim() || undefined },
      {
        onSuccess: (map) => {
          onClose();
          navigate(`/book/${bookId}/maps/${map.id}`);
        },
        onError: (e) => setError(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('maps.newDialog.title')}
      description={t('maps.newDialog.description')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t('maps.newDialog.titleField')}>
          <input
            className={uiStyles.input}
            value={title}
            maxLength={MAP_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(`maps.template.${template}.name`)}
          />
        </Field>
        <div
          className={styles.templates}
          role="radiogroup"
          aria-label={t('maps.newDialog.template')}
        >
          {MAP_TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={template === id}
              className={`${styles.template} ${template === id ? styles.templateOn : ''}`}
              onClick={() => setTemplate(id)}
            >
              <strong>{t(`maps.template.${id}.name`)}</strong>
              <span>{t(`maps.template.${id}.text`)}</span>
            </button>
          ))}
        </div>
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            {t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({
  bookId,
  map,
  onClose,
}: {
  bookId: string;
  map: StoryMap;
  onClose: () => void;
}) {
  const t = useT();
  const rename = useRenameMap(bookId);
  const [title, setTitle] = useState(map.title);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('maps.renameDialog.title')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: map.id, title },
            { onSuccess: onClose, onError: (x) => setError(apiErrorMessage(x)) },
          );
        }}
      >
        <Field label={t('maps.renameDialog.titleField')}>
          <input
            className={uiStyles.input}
            value={title}
            maxLength={MAP_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </Field>
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!title.trim() || rename.isPending}>
            {t('common.rename')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  bookId,
  map,
  onDeleted,
  onClose,
}: {
  bookId: string;
  map: StoryMap;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const remove = useDeleteMap(bookId);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('maps.deleteDialog.title')}
      description={t('maps.deleteDialog.description', { title: map.title })}
    >
      <FormError message={error} />
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(map.id, {
              onSuccess: () => {
                onClose();
                onDeleted();
              },
              onError: (e) => setError(apiErrorMessage(e)),
            })
          }
        >
          {t('maps.deleteDialog.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}

const isTemplate = (value: string): value is MapTemplate =>
  (MAP_TEMPLATES as readonly string[]).includes(value);

interface MapListProps {
  bookId: string;
  maps: StoryMap[];
  selectedId: string | undefined;
}

/** MAP-01: the maps of a book, with create, rename, duplicate and delete. */
export function MapList({ bookId, maps, selectedId }: MapListProps) {
  const t = useT();
  const navigate = useNavigate();
  const duplicate = useDuplicateMap(bookId);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<StoryMap | null>(null);
  const [deleting, setDeleting] = useState<StoryMap | null>(null);

  return (
    <aside className={styles.list} aria-label={t('maps.list.label')}>
      <div className={styles.listHeader}>
        <span>{t('maps.list.heading')}</span>
        <Button
          onClick={() => setCreating(true)}
          aria-label={t('maps.list.newMap')}
          title={t('maps.list.newMap')}
        >
          <Plus size={14} /> {t('maps.list.new')}
        </Button>
      </div>
      {maps.length === 0 ? (
        <p className={styles.muted} style={{ padding: '0 0.9rem' }}>
          {t('maps.list.none')}
        </p>
      ) : null}
      {maps.map((map) => (
        <div
          key={map.id}
          className={`${styles.listRow} ${map.id === selectedId ? styles.listRowOn : ''}`}
        >
          <NavLink className={styles.listLink} to={`/book/${bookId}/maps/${map.id}`}>
            <span className={styles.listTitle}>{map.title}</span>
            <span className={styles.muted}>
              {isTemplate(map.template)
                ? t(`maps.template.${map.template}.name`)
                : t('maps.template.unknown')}{' '}
              · {t('maps.list.nodeCount', { count: map.data.nodes.length })}
            </span>
          </NavLink>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={libraryStyles.menuButtonInline}
              aria-label={t('maps.list.rowActions', { title: map.title })}
            >
              <MoreHorizontal size={16} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={libraryStyles.menu} align="end" sideOffset={4}>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() => setRenaming(map)}
                >
                  <Pencil size={16} /> {t('maps.list.renameMenu')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() => {
                    // The copy is made from the stored map, so the latest edits are saved first.
                    const saver = mapSavers().find((s) => s.mapId === map.id);
                    void (saver?.flush() ?? Promise.resolve()).then(() => {
                      if (saver && (saver.state !== 'saved' || saver.hasUnsaved())) {
                        notifyError(
                          t('maps.list.notDuplicatedUnsaved', {
                            error: apiErrorMessage(saver.cause),
                          }),
                        );
                        return;
                      }
                      duplicate.mutate(map.id, {
                        onSuccess: (copy) => navigate(`/book/${bookId}/maps/${copy.id}`),
                        onError: (e) =>
                          notifyError(t('maps.list.notDuplicated', { error: apiErrorMessage(e) })),
                      });
                    });
                  }}
                >
                  <Copy size={16} /> {t('common.duplicate')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() => setDeleting(map)}
                >
                  <Trash2 size={16} /> {t('maps.list.deleteMenu')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ))}
      {creating ? <NewMapDialog bookId={bookId} onClose={() => setCreating(false)} /> : null}
      {renaming ? (
        <RenameDialog bookId={bookId} map={renaming} onClose={() => setRenaming(null)} />
      ) : null}
      {deleting ? (
        <DeleteDialog
          bookId={bookId}
          map={deleting}
          onDeleted={() => {
            if (deleting.id === selectedId) navigate(`/book/${bookId}/maps`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </aside>
  );
}

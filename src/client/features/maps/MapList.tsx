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
import { useWorkspaceStore } from '../../stores/workspace.ts';
import libraryStyles from '../../pages/library/library.module.css';
import styles from './maps.module.css';

const TEMPLATE_INFO: Record<MapTemplate, { name: string; text: string }> = {
  blank: { name: 'Blank', text: 'Start from an empty canvas.' },
  timeline: { name: 'Timeline', text: 'A left-to-right chain of stages.' },
  'plot-tree': { name: 'Plot tree', text: 'A top-down tree from premise to resolution.' },
  'character-arc': { name: 'Character arc', text: 'Start state, change points, end state.' },
};

const report = (action: string) => (error: Error) =>
  useWorkspaceStore.getState().notify({ tone: 'error', message: `${action} ${error.message}` });

function NewMapDialog({ bookId, onClose }: { bookId: string; onClose: () => void }) {
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
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="New story map"
      description="Templates are only starting layouts; you can change everything afterwards."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Title (optional)">
          <input
            className={uiStyles.input}
            value={title}
            maxLength={MAP_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TEMPLATE_INFO[template].name}
          />
        </Field>
        <div className={styles.templates} role="radiogroup" aria-label="Template">
          {MAP_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={template === t}
              className={`${styles.template} ${template === t ? styles.templateOn : ''}`}
              onClick={() => setTemplate(t)}
            >
              <strong>{TEMPLATE_INFO[t].name}</strong>
              <span>{TEMPLATE_INFO[t].text}</span>
            </button>
          ))}
        </div>
        <FormError message={error} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            Create
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
  const rename = useRenameMap(bookId);
  const [title, setTitle] = useState(map.title);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Rename map">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: map.id, title },
            { onSuccess: onClose, onError: (x) => setError(x.message) },
          );
        }}
      >
        <Field label="Title">
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
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!title.trim() || rename.isPending}>
            Rename
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
  const remove = useDeleteMap(bookId);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete map?"
      description={`“${map.title}” and everything on it will be deleted. This cannot be undone.`}
    >
      <FormError message={error} />
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(map.id, {
              onSuccess: () => {
                onClose();
                onDeleted();
              },
              onError: (e) => setError(e.message),
            })
          }
        >
          Delete map
        </Button>
      </div>
    </Dialog>
  );
}

interface MapListProps {
  bookId: string;
  maps: StoryMap[];
  selectedId: string | undefined;
}

/** MAP-01: the maps of a book, with create, rename, duplicate and delete. */
export function MapList({ bookId, maps, selectedId }: MapListProps) {
  const navigate = useNavigate();
  const duplicate = useDuplicateMap(bookId);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<StoryMap | null>(null);
  const [deleting, setDeleting] = useState<StoryMap | null>(null);

  return (
    <aside className={styles.list} aria-label="Story maps">
      <div className={styles.listHeader}>
        <span>Maps</span>
        <Button onClick={() => setCreating(true)} aria-label="New map" title="New map">
          <Plus size={14} /> New
        </Button>
      </div>
      {maps.length === 0 ? (
        <p className={styles.muted} style={{ padding: '0 0.9rem' }}>
          No maps yet. Create one from a template.
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
              {TEMPLATE_INFO[map.template as MapTemplate]?.name ?? 'Map'} · {map.data.nodes.length}{' '}
              nodes
            </span>
          </NavLink>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={libraryStyles.menuButtonInline}
              aria-label={`Actions for ${map.title}`}
            >
              <MoreHorizontal size={16} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={libraryStyles.menu} align="end" sideOffset={4}>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() => setRenaming(map)}
                >
                  <Pencil size={16} /> Rename…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() =>
                    duplicate.mutate(map.id, {
                      onSuccess: (copy) => navigate(`/book/${bookId}/maps/${copy.id}`),
                      onError: report('The map was not duplicated.'),
                    })
                  }
                >
                  <Copy size={16} /> Duplicate
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={libraryStyles.menuItem}
                  onSelect={() => setDeleting(map)}
                >
                  <Trash2 size={16} /> Delete…
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

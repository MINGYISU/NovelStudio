import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Tree, type TreeApi } from 'react-arborist';
import { useNavigate } from 'react-router';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import { arboristIndexToFinalIndex, checkMove, type KeyboardMove } from '../../../shared/tree.ts';
import { NODE_KINDS, type TreeNode } from '../../../shared/types.ts';
import { formatWords, useT } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { buildItems, totalWords, type TreeItem } from './build-items.ts';
import { initialOpenState, saveOpenState } from './fold-state.ts';
import { SectionWarningsContext, SidebarContext } from './sidebar-context.ts';
import { TrashDialog } from './TrashDialog.tsx';
import { TreeRow } from './TreeRow.tsx';
import { useTreeActions } from './useTreeActions.ts';
import styles from './manuscript.module.css';

const ROW_HEIGHT = 30;
const INDENT = 20;

interface SidebarProps {
  bookId: string;
  nodes: TreeNode[];
  structure: StructureSettings;
  selectedId: string | undefined;
  /** Foreshadow warnings per section, shown as badges. */
  warnings: ReadonlyMap<string, ForeshadowWarning[]>;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [element, setElement] = useState<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setElement(el);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, element, ...size };
}

/** Sidebar tree (TREE-05..07, MOVE-01..11). Mount it with `key={bookId}`. */
export function Sidebar({ bookId, nodes, structure, selectedId, warnings }: SidebarProps) {
  const t = useT();
  const navigate = useNavigate();
  const actions = useTreeActions(bookId, nodes);
  const items = useMemo(
    () => buildItems(nodes, structure, t('common.untitled')),
    [nodes, structure, t],
  );
  const words = useMemo(() => totalWords(nodes), [nodes]);
  const trashed = useMemo(() => nodes.filter((n) => n.deletedAt !== null).length, [nodes]);
  const [trashOpen, setTrashOpen] = useState(false);
  const treeRef = useRef<TreeApi<TreeItem> | null>(null);
  const [initialOpen] = useState(() => initialOpenState(bookId, nodes));
  const { ref: boxRef, element: boxElement, width, height } = useElementSize<HTMLDivElement>();
  const pendingEditId = useWorkspaceStore((s) => s.pendingEditId);

  useEffect(() => {
    if (!pendingEditId) return;
    const tree = treeRef.current;
    if (!tree?.get(pendingEditId)) return;
    useWorkspaceStore.getState().setPendingEditId(null);
    tree.openParents(pendingEditId);
    const frame = requestAnimationFrame(() => void tree.edit(pendingEditId));
    return () => cancelAnimationFrame(frame);
  }, [pendingEditId, nodes]);

  useEffect(() => {
    if (selectedId) treeRef.current?.openParents(selectedId);
  }, [selectedId]);

  const persistOpenState = useCallback(() => {
    const tree = treeRef.current;
    if (tree) saveOpenState(bookId, { ...initialOpen, ...tree.openState }, nodes);
  }, [bookId, initialOpen, nodes]);

  const keyMove = (key: KeyboardMove) => {
    const tree = treeRef.current;
    const focused = tree?.focusedNode;
    if (!tree || !focused) return;
    const parentId = actions.moveWithKey(focused.id, key);
    if (parentId) tree.open(parentId);
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const tree = treeRef.current;
    const focused = tree?.focusedNode;
    if (!tree) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      handled();
      actions.undoMove();
    } else if (!focused) {
      return;
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      handled();
      keyMove(event.key === 'ArrowUp' ? 'up' : 'down');
    } else if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      handled();
      keyMove(event.shiftKey ? 'outdent' : 'indent');
    } else if (event.key === 'F2') {
      handled();
      void tree.edit(focused);
    }
  };

  return (
    <SidebarContext.Provider value={actions}>
      <SectionWarningsContext.Provider value={warnings}>
        <aside className={styles.sidebar} aria-label={t('manuscript.sidebar.title')}>
          <div className={styles.sidebarHeader}>
            <span>{t('manuscript.sidebar.title')}</span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t('manuscript.sidebar.addSection')}
                >
                  <Plus size={16} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
                  {NODE_KINDS.slice(0, 3).map((kind) => (
                    <DropdownMenu.Item
                      key={kind}
                      className={styles.menuItem}
                      onSelect={() => actions.createAtRoot(kind)}
                    >
                      {t('manuscript.sidebar.newKind', { kind: t(`kind.${kind}`).toLowerCase() })}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          <div ref={boxRef} className={styles.treeBox} onKeyDownCapture={onKeyDownCapture}>
            {items.length === 0 ? (
              <p className={styles.emptyTree}>{t('manuscript.sidebar.empty')}</p>
            ) : null}
            {width > 0 && height > 0 ? (
              <Tree<TreeItem>
                ref={treeRef}
                // Drag and drop is scoped to the tree: a window-wide backend would swallow drops in the editor.
                dndRootElement={boxElement}
                data={items}
                idAccessor="id"
                childrenAccessor="children"
                width={width}
                height={height}
                rowHeight={ROW_HEIGHT}
                indent={INDENT}
                openByDefault={false}
                initialOpenState={initialOpen}
                selection={selectedId}
                selectionFollowsFocus
                disableMultiSelection
                disableDrop={({ parentNode, dragNodes, index }) => {
                  const drag = dragNodes[0];
                  if (!drag) return true;
                  const parentId = parentNode.isRoot ? null : parentNode.id;
                  const finalIndex = arboristIndexToFinalIndex(nodes, drag.id, parentId, index);
                  return !checkMove(nodes, drag.id, parentId, finalIndex).ok;
                }}
                onMove={({ dragIds, parentId, index }) => {
                  const id = dragIds[0];
                  if (!id) return;
                  actions.move(id, parentId, arboristIndexToFinalIndex(nodes, id, parentId, index));
                }}
                onRename={({ id, name }) => actions.rename(id, name)}
                onToggle={persistOpenState}
                onSelect={(selected) => {
                  const id = selected[0]?.id;
                  if (id && id !== selectedId)
                    navigate(`/book/${bookId}/manuscript/${id}`, { replace: true });
                }}
              >
                {TreeRow}
              </Tree>
            ) : null}
          </div>
          <div className={styles.sidebarFooter}>
            <span>{formatWords(words)}</span>
            <button
              type="button"
              className={styles.trashButton}
              onClick={() => setTrashOpen(true)}
              aria-label={
                trashed > 0
                  ? t('manuscript.sidebar.trashWithCount', { count: trashed })
                  : t('manuscript.sidebar.trash')
              }
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('manuscript.sidebar.trash')}
              {trashed > 0 ? <span data-testid="trash-count">{trashed}</span> : null}
            </button>
          </div>
          {trashOpen ? (
            <TrashDialog
              nodes={nodes}
              structure={structure}
              onRestore={actions.restore}
              onClose={() => setTrashOpen(false)}
            />
          ) : null}
        </aside>
      </SectionWarningsContext.Provider>
    </SidebarContext.Provider>
  );
}

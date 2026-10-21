import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, MoreHorizontal, Settings, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { useBook } from '../../api/books.ts';
import { threadsKey } from '../../api/foreshadows.ts';
import { treeKey, useTree } from '../../api/nodes.ts';
import { Button } from '../../components/ui.tsx';
import { CodexView } from '../../features/codex/CodexView.tsx';
import { ForeshadowView } from '../../features/foreshadow/ForeshadowView.tsx';
import { useForeshadowAnalysis } from '../../features/foreshadow/useForeshadowAnalysis.ts';
import { MapsView } from '../../features/maps/MapsView.tsx';
import { computeDisplayTitles } from '../../../shared/numbering.ts';
import { EditorPanel } from '../../features/editor/EditorPanel.tsx';
import { saverRegistry } from '../../features/editor/save-registry.ts';
import { SaveStatus } from '../../features/editor/SaveStatus.tsx';
import { DetailsPanel } from '../../features/manuscript/DetailsPanel.tsx';
import { NoticeBar } from '../../features/manuscript/NoticeBar.tsx';
import { Resizer } from '../../features/manuscript/Resizer.tsx';
import { Sidebar } from '../../features/manuscript/Sidebar.tsx';
import { totalWords } from '../../features/manuscript/build-items.ts';
import { StructureDialog } from '../../features/manuscript/StructureDialog.tsx';
import { ExportDialog } from '../../features/settings/ExportDialog.tsx';
import { warningsByNode } from '../../../shared/foreshadow.ts';
import { DEFAULT_DORMANT_AFTER } from '../../../shared/schemas/foreshadow.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import libraryStyles from '../library/library.module.css';
import styles from '../../features/manuscript/manuscript.module.css';

/** Workspace layout: top bar with save status, resizable sidebar, editor, details panel. */
export function WorkspacePage({ view }: { view: 'manuscript' | 'codex' | 'maps' | 'foreshadow' }) {
  const { bookId, nodeId, entryId, mapId } = useParams();
  const book = useBook(bookId);
  const tree = useTree(book.data && !book.data.deletedAt ? bookId : undefined);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const [editingStructure, setEditingStructure] = useState(false);
  const [exporting, setExporting] = useState(false);
  const client = useQueryClient();

  // A finished save carries the section's new word count; keep the sidebar and totals current.
  useEffect(() => {
    if (!bookId) return;
    return saverRegistry.onSaved((id, result) => {
      client.setQueryData<TreeNode[]>(treeKey(bookId), (nodes) =>
        nodes?.map((n) => (n.id === id ? { ...n, wordCount: result.wordCount } : n)),
      );
      // Saving text can move an occurrence or change its anchor state (FS-08).
      void client.invalidateQueries({ queryKey: threadsKey(bookId) });
    });
  }, [bookId, client]);

  const nodes = tree.data;
  const navigate = useNavigate();
  const analysis = useForeshadowAnalysis(
    book.data && !book.data.deletedAt ? bookId : undefined,
    nodes,
    book.data?.foreshadow.dormantAfter ?? DEFAULT_DORMANT_AFTER,
    () => navigate(`/book/${bookId}/foreshadow`),
  );
  const warnings = useMemo(() => warningsByNode(analysis.warnings), [analysis.warnings]);
  const selected = nodes?.find((n) => n.id === nodeId && n.deletedAt === null);
  const lastNode = useWorkspaceStore((s) => (bookId ? s.lastNodeByBook[bookId] : undefined));
  const lastMap = useWorkspaceStore((s) => (bookId ? s.lastMapByBook[bookId] : undefined));
  useEffect(() => {
    if (bookId && selected) useWorkspaceStore.getState().setLastNode(bookId, selected.id);
  }, [bookId, selected]);
  const displayTitle = useMemo(
    () =>
      nodes && selected && book.data
        ? computeDisplayTitles(nodes, book.data.structure).get(selected.id)
        : undefined,
    [nodes, selected, book.data],
  );

  if (book.isPending) return <p className={libraryStyles.empty}>Loading…</p>;
  if (book.error || !book.data) {
    return (
      <main className={libraryStyles.page}>
        <Link className={libraryStyles.sort} to="/">
          <ArrowLeft size={16} /> Library
        </Link>
        <p className={`${libraryStyles.empty} ${libraryStyles.error}`} role="alert">
          This book could not be opened.
        </p>
      </main>
    );
  }
  if (book.data.deletedAt) {
    return (
      <main className={libraryStyles.page}>
        <Link className={libraryStyles.sort} to="/">
          <ArrowLeft size={16} /> Library
        </Link>
        <h1 className={libraryStyles.heading}>{book.data.title}</h1>
        <p className={libraryStyles.empty}>
          This book is in the trash. Restore it from the library to open it.
        </p>
      </main>
    );
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.topBar}>
        <Link className={libraryStyles.sort} to="/">
          <ArrowLeft size={16} /> Library
        </Link>
        <h1 className={styles.bookTitle}>{book.data.title}</h1>
        <nav className={styles.viewTabs} aria-label="Views">
          {(
            [
              [
                'Manuscript',
                'manuscript',
                `/book/${book.data.id}/manuscript${lastNode ? `/${lastNode}` : ''}`,
              ],
              ['Story Maps', 'maps', `/book/${book.data.id}/maps${lastMap ? `/${lastMap}` : ''}`],
              ['Foreshadowing', 'foreshadow', `/book/${book.data.id}/foreshadow`],
              ['Codex', 'codex', `/book/${book.data.id}/codex`],
            ] as const
          ).map(([label, target, to]) => (
            <NavLink
              key={label}
              to={to}
              className={() => `${styles.viewTab} ${target === view ? styles.viewTabActive : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <SaveStatus />
        <Button onClick={() => setEditingStructure(true)}>
          <Settings2 size={16} /> Structure
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={libraryStyles.menuButtonInline} aria-label="Book menu">
            <MoreHorizontal size={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={libraryStyles.menu} align="end" sideOffset={4}>
              <DropdownMenu.Item
                className={libraryStyles.menuItem}
                onSelect={() => setExporting(true)}
              >
                <Download size={16} /> Export cold backup…
              </DropdownMenu.Item>
              <DropdownMenu.Item className={libraryStyles.menuItem} asChild>
                <Link to="/settings">
                  <Settings size={16} /> Settings
                </Link>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      {view === 'codex' ? (
        <CodexView key={book.data.id} bookId={book.data.id} entryId={entryId} />
      ) : view === 'foreshadow' ? (
        <ForeshadowView
          key={book.data.id}
          bookId={book.data.id}
          nodes={nodes}
          structure={book.data.structure}
          dormantAfter={book.data.foreshadow.dormantAfter}
          threads={analysis.threads}
          warnings={analysis.warnings}
          failed={analysis.failed}
        />
      ) : view === 'maps' ? (
        <MapsView
          key={book.data.id}
          bookId={book.data.id}
          mapId={mapId}
          nodes={nodes}
          treeFailed={tree.isError}
          structure={book.data.structure}
        />
      ) : (
        <div
          className={styles.body}
          style={{ gridTemplateColumns: `${sidebarWidth}px 6px 1fr 18rem` }}
        >
          {nodes ? (
            <Sidebar
              key={book.data.id}
              bookId={book.data.id}
              nodes={nodes}
              structure={book.data.structure}
              selectedId={selected?.id}
              warnings={warnings}
            />
          ) : (
            <aside className={styles.sidebar}>
              <p className={styles.emptyTree} role={tree.error ? 'alert' : undefined}>
                {tree.error ? 'The manuscript could not be loaded.' : 'Loading…'}
              </p>
            </aside>
          )}
          <Resizer />
          <main className={styles.main}>
            {selected && displayTitle && nodes ? (
              <EditorPanel
                bookId={book.data.id}
                nodeId={selected.id}
                displayTitle={displayTitle}
                display={book.data.display}
                bookWords={totalWords(nodes)}
                savedSectionWords={selected.wordCount}
              />
            ) : (
              <p className={styles.mainPlaceholder}>Select a section to start writing.</p>
            )}
          </main>
          <DetailsPanel
            bookId={book.data.id}
            node={selected}
            displayTitle={displayTitle}
            threads={analysis.threads}
            warnings={analysis.warnings}
          />
        </div>
      )}
      <NoticeBar />
      {exporting ? (
        <ExportDialog
          scope={{ kind: 'book', bookId: book.data.id, title: book.data.title }}
          onClose={() => setExporting(false)}
        />
      ) : null}
      {editingStructure ? (
        <StructureDialog
          bookId={book.data.id}
          structure={book.data.structure}
          onClose={() => setEditingStructure(false)}
        />
      ) : null}
    </div>
  );
}

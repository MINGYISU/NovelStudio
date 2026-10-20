import { ArrowLeft, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useBook } from '../../api/books.ts';
import { useTree } from '../../api/nodes.ts';
import { Button } from '../../components/ui.tsx';
import { computeDisplayTitles } from '../../../shared/numbering.ts';
import { DetailsPanel } from '../../features/manuscript/DetailsPanel.tsx';
import { NoticeBar } from '../../features/manuscript/NoticeBar.tsx';
import { Resizer } from '../../features/manuscript/Resizer.tsx';
import { Sidebar } from '../../features/manuscript/Sidebar.tsx';
import { StructureDialog } from '../../features/manuscript/StructureDialog.tsx';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import libraryStyles from '../library/library.module.css';
import styles from '../../features/manuscript/manuscript.module.css';

/** Workspace layout (M3): top bar, resizable sidebar, main panel placeholder, details panel. */
export function WorkspacePage() {
  const { bookId, nodeId } = useParams();
  const book = useBook(bookId);
  const tree = useTree(book.data && !book.data.deletedAt ? bookId : undefined);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const [editingStructure, setEditingStructure] = useState(false);

  const nodes = tree.data;
  const selected = nodes?.find((n) => n.id === nodeId && n.deletedAt === null);
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
        <Button onClick={() => setEditingStructure(true)}>
          <Settings2 size={16} /> Structure
        </Button>
      </header>
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
          <p className={styles.mainPlaceholder}>
            {selected && displayTitle
              ? displayTitle
              : 'Select a section. The editor arrives in a later milestone.'}
          </p>
        </main>
        <DetailsPanel bookId={book.data.id} node={selected} displayTitle={displayTitle} />
      </div>
      <NoticeBar />
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

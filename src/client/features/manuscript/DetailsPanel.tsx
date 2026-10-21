import { useState } from 'react';
import { useUpdateNode } from '../../api/nodes.ts';
import { uiStyles } from '../../components/ui.tsx';
import {
  NODE_SYNOPSIS_MAX,
  NODE_TITLE_MAX,
  type PatchNodeBody,
} from '../../../shared/schemas/node.ts';
import { NODE_STATUSES, type NodeStatus, type TreeNode } from '../../../shared/types.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { CharactersInSection } from '../codex/CharactersInSection.tsx';
import styles from './manuscript.module.css';

interface DetailsPanelProps {
  bookId: string;
  node: TreeNode | undefined;
  displayTitle: string | undefined;
}

/** Right panel (TREE-09, TREE-10): title, status, numbering and synopsis of the selected section. */
export function DetailsPanel({ bookId, node, displayTitle }: DetailsPanelProps) {
  return (
    <aside className={styles.details} aria-label="Section details">
      {node ? (
        <>
          <DetailsForm
            // Remount when the saved values change so the fields never show stale text.
            key={`${node.id}|${node.title}|${node.synopsis}|${node.status}|${node.numbered}`}
            bookId={bookId}
            node={node}
            displayTitle={displayTitle ?? node.title}
          />
          <CharactersInSection key={node.id} bookId={bookId} nodeId={node.id} />
        </>
      ) : (
        <p className={styles.detailsEmpty}>Select a section to see its details.</p>
      )}
    </aside>
  );
}

function DetailsForm({
  bookId,
  node,
  displayTitle,
}: {
  bookId: string;
  node: TreeNode;
  displayTitle: string;
}) {
  const update = useUpdateNode(bookId);
  const [title, setTitle] = useState(node.title);
  const [synopsis, setSynopsis] = useState(node.synopsis);

  const save = (patch: PatchNodeBody) =>
    update.mutateAsync({ id: node.id, patch }).catch((error: Error) =>
      useWorkspaceStore.getState().notify({
        tone: 'error',
        message: `The change was not saved. ${error.message}`,
      }),
    );

  return (
    <div>
      <h2 className={styles.detailsHeading}>{displayTitle}</h2>
      <p className={styles.detailsMeta}>
        {node.kind} · {node.wordCount.toLocaleString()} words
      </p>
      <label className={uiStyles.field}>
        <span>Title</span>
        <input
          className={uiStyles.input}
          value={title}
          maxLength={NODE_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== node.title && save({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      <label className={uiStyles.field}>
        <span>Status</span>
        <select
          className={uiStyles.input}
          value={node.status}
          onChange={(e) => save({ status: e.target.value as NodeStatus })}
        >
          {NODE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={node.numbered}
          onChange={(e) => save({ numbered: e.target.checked })}
        />
        Numbered
      </label>
      <label className={uiStyles.field}>
        <span>Synopsis</span>
        <textarea
          className={uiStyles.input}
          rows={6}
          value={synopsis}
          maxLength={NODE_SYNOPSIS_MAX}
          onChange={(e) => setSynopsis(e.target.value)}
          onBlur={() => synopsis.trim() !== node.synopsis && save({ synopsis: synopsis.trim() })}
        />
      </label>
    </div>
  );
}

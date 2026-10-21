import { useEffect, useMemo, useRef } from 'react';
import {
  analyzeForeshadows,
  newWarnings,
  type ForeshadowWarning,
} from '../../../shared/foreshadow.ts';
import type { Thread } from '../../../shared/schemas/foreshadow.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { useThreads } from '../../api/foreshadows.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';

const EMPTY: ForeshadowWarning[] = [];
const MERGE_WINDOW_MS = 2000;
const REVIEW_LABEL = 'Review';

export interface ForeshadowAnalysis {
  threads: Thread[] | undefined;
  /** Recomputed from the cached tree and threads, so a drag in the sidebar shows up at once. */
  warnings: ForeshadowWarning[];
  failed: boolean;
}

/**
 * FS-05/FS-06: analysis of every thread against the current tree, plus a toast for warnings that
 * did not exist a moment ago. The first result after loading a book never raises a toast.
 */
export function useForeshadowAnalysis(
  bookId: string | undefined,
  nodes: readonly TreeNode[] | undefined,
  dormantAfter: number,
  onReview: () => void,
): ForeshadowAnalysis {
  const threadsQuery = useThreads(bookId);
  const threads = threadsQuery.data;

  const warnings = useMemo(
    () => (nodes && threads ? analyzeForeshadows(nodes, threads, { dormantAfter }) : EMPTY),
    [nodes, threads, dormantAfter],
  );
  const ready = bookId !== undefined && nodes !== undefined && threads !== undefined;

  const previous = useRef<{ bookId: string; warnings: ForeshadowWarning[] } | null>(null);
  const review = useRef(onReview);
  useEffect(() => {
    review.current = onReview;
  });

  useEffect(() => {
    if (!ready || bookId === undefined) return;
    const before = previous.current;
    previous.current = { bookId, warnings };
    if (!before || before.bookId !== bookId) return;
    const created = newWarnings(before.warnings, warnings).filter((w) => w.level === 'warning');
    if (created.length === 0) return;
    const message =
      created.length === 1
        ? (created[0]?.message ?? 'A new foreshadowing warning.')
        : `${created.length} new foreshadowing warnings.`;
    const { notice, notify } = useWorkspaceStore.getState();
    // The action that caused the warning (trash with Restore, say) keeps its button.
    if (
      notice?.tone === 'info' &&
      notice.action &&
      notice.action.label !== REVIEW_LABEL &&
      Date.now() - notice.at < MERGE_WINDOW_MS
    ) {
      notify({ tone: 'info', message: `${notice.message} ${message}`, action: notice.action });
      return;
    }
    notify({ tone: 'info', message, action: { label: REVIEW_LABEL, run: () => review.current() } });
  }, [bookId, ready, warnings]);

  return { threads, warnings, failed: threadsQuery.isError };
}

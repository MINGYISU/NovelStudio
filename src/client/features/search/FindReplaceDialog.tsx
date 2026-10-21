import { useMemo, useState, type FormEvent } from 'react';
import { computeDisplayTitles } from '../../../shared/numbering.ts';
import {
  REPLACEMENT_MAX,
  SEARCH_QUERY_MAX,
  type SearchResponse,
} from '../../../shared/schemas/search.ts';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import { buildTree, type TreeBranch } from '../../../shared/tree.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { searchBook, useReplaceInBook } from '../../api/search.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { saverRegistry } from '../editor/save-registry.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import styles from './search.module.css';

function readingOrder(branches: TreeBranch<TreeNode>[]): string[] {
  return branches.flatMap(({ node, children }) => [node.id, ...readingOrder(children)]);
}

/** Text that is typed but not saved would be missed (or overwritten), so everything is saved first. */
async function saveEverything(): Promise<string | null> {
  await saverRegistry.flushAll();
  const status = saverRegistry.status();
  if (status.kind === 'error') return `Some text is not saved yet: ${status.message}`;
  if (status.kind === 'stale')
    return 'A section was changed elsewhere. Reload it before replacing.';
  return null;
}

/** Find & replace across the whole book (ED-09). Every affected section is snapshotted first. */
export function FindReplaceDialog({
  bookId,
  nodes,
  structure,
  onClose,
}: {
  bookId: string;
  nodes: TreeNode[];
  structure: StructureSettings;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [found, setFound] = useState<(SearchResponse & { query: string }) | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ replaced: number; sections: number } | null>(null);
  const replace = useReplaceInBook(bookId);

  const { titles, order } = useMemo(
    () => ({
      titles: computeDisplayTitles(nodes, structure),
      order: readingOrder(buildTree(nodes)),
    }),
    [nodes, structure],
  );
  const sections = useMemo(() => {
    if (!found) return [];
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...found.sections].sort(
      (a, b) => (rank.get(a.nodeId) ?? 0) - (rank.get(b.nodeId) ?? 0),
    );
  }, [found, order]);

  const chosen = sections.filter((s) => !unchecked.has(s.nodeId));
  const chosenMatches = chosen.reduce((sum, s) => sum + s.count, 0);

  const reset = () => {
    setFound(null);
    setDone(null);
    setError(null);
  };

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    if (query === '' || busy) return;
    setBusy(true);
    reset();
    try {
      const problem = await saveEverything();
      if (problem) {
        setError(problem);
        return;
      }
      setFound({ ...(await searchBook(bookId, { query, caseSensitive })), query });
      setUnchecked(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runReplace = async () => {
    if (!found || chosen.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await saveEverything();
      if (problem) {
        setError(problem);
        return;
      }
      const result = await replace.mutateAsync({
        query: found.query,
        replacement,
        caseSensitive,
        nodeIds: chosen.map((s) => s.nodeId),
      });
      // Changed text must be re-read from the server, never saved over from an old editor copy.
      for (const s of result.sections) saverRegistry.drop(s.nodeId);
      useWorkspaceStore.getState().bumpContentEpoch();
      setDone({ replaced: result.replaced, sections: result.sections.length });
      setFound(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (nodeId: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const replaceLabel = `Replace ${chosenMatches} in ${chosen.length} ${
    chosen.length === 1 ? 'section' : 'sections'
  }`;

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => !open && onClose()}
      title="Find and replace in book"
      description="Matches are found inside one stretch of formatting, so a phrase that is partly bold is not matched. A snapshot of every changed section is saved first."
    >
      <form onSubmit={runSearch}>
        <Field label="Find">
          <input
            className={uiStyles.input}
            value={query}
            maxLength={SEARCH_QUERY_MAX}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            aria-label="Find"
          />
        </Field>
        <Field label="Replace with">
          <input
            className={uiStyles.input}
            value={replacement}
            maxLength={REPLACEMENT_MAX}
            onChange={(e) => setReplacement(e.target.value)}
            aria-label="Replace with"
          />
        </Field>
        <div className={styles.options}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => {
                setCaseSensitive(e.target.checked);
                reset();
              }}
            />
            Match case
          </label>
          <Button type="submit" disabled={query === '' || busy}>
            {busy && !found ? 'Searching…' : 'Find all'}
          </Button>
        </div>
      </form>

      <FormError message={error} />

      {found ? (
        found.total === 0 ? (
          <p className={styles.notice} role="status">
            No matches for “{found.query}”.
          </p>
        ) : (
          <>
            <p className={styles.summary} role="status">
              {found.total} {found.total === 1 ? 'match' : 'matches'} in {found.sections.length}{' '}
              {found.sections.length === 1 ? 'section' : 'sections'}
            </p>
            <ul className={styles.list} aria-label="Matches by section">
              {sections.map((s) => (
                <li key={s.nodeId} className={styles.item}>
                  <label className={styles.itemHead}>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(s.nodeId)}
                      onChange={() => toggle(s.nodeId)}
                      aria-label={`Replace in ${titles.get(s.nodeId) ?? 'section'}`}
                    />
                    <span>{titles.get(s.nodeId) ?? '(untitled)'}</span>
                    <span className={styles.count}>
                      {s.count} {s.count === 1 ? 'match' : 'matches'}
                    </span>
                  </label>
                  {s.excerpts.map((x, i) => (
                    <p key={i} className={styles.excerpt}>
                      …{x.before}
                      <mark>{x.match}</mark>
                      {x.after}…
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {found.skipped > 0 ? (
              <p className={styles.notice}>
                {found.skipped} section(s) have unreadable text and were not searched.
              </p>
            ) : null}
          </>
        )
      ) : null}

      {done ? (
        <p className={styles.ok} role="status">
          Replaced {done.replaced} {done.replaced === 1 ? 'match' : 'matches'} in {done.sections}{' '}
          {done.sections === 1 ? 'section' : 'sections'}. Earlier versions are in each section’s
          snapshots.
        </p>
      ) : null}

      <div className={uiStyles.actions}>
        <Button onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
        {found && found.total > 0 ? (
          <Button
            variant="primary"
            onClick={() => void runReplace()}
            disabled={busy || chosen.length === 0}
          >
            {busy ? 'Replacing…' : replaceLabel}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

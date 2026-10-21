import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { sectionTargets } from '../../../shared/map-links.ts';
import type { MapLink } from '../../../shared/schemas/map.ts';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import { buildTree, type TreeBranch } from '../../../shared/tree.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { useCodex } from '../../api/codex.ts';
import { useMaps } from '../../api/maps.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { MapCanvas } from './MapCanvas.tsx';
import { MapList } from './MapList.tsx';
import styles from './maps.module.css';
import type { EntryOption, SectionOption } from './NodeInspector.tsx';

interface MapsViewProps {
  bookId: string;
  mapId: string | undefined;
  nodes: TreeNode[] | undefined;
  /** True when the manuscript could not be loaded, so link titles cannot be shown. */
  treeFailed: boolean;
  structure: StructureSettings;
}

function flatten(
  branches: TreeBranch<TreeNode>[],
  labels: ReadonlyMap<string, { title: string }>,
  depth = 0,
): SectionOption[] {
  return branches.flatMap(({ node, children }) => [
    { id: node.id, label: labels.get(node.id)?.title ?? node.title, depth },
    ...flatten(children, labels, depth + 1),
  ]);
}

/** The Story Maps view: map list on the left, canvas and details on the right. */
export function MapsView({ bookId, mapId, nodes, treeFailed, structure }: MapsViewProps) {
  const navigate = useNavigate();
  const maps = useMaps(bookId);
  const codex = useCodex(bookId);

  const selected = maps.data?.find((m) => m.id === mapId);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId) useWorkspaceStore.getState().setLastMap(bookId, selectedId);
  }, [bookId, selectedId]);

  const targets = useMemo(
    () => (nodes ? sectionTargets(nodes, structure) : null),
    [nodes, structure],
  );
  const entryTitles = useMemo(
    () => (codex.data ? new Map(codex.data.entries.map((e) => [e.id, e.title])) : null),
    [codex.data],
  );
  const sectionOptions = useMemo(
    () =>
      nodes && targets
        ? flatten(buildTree(nodes.filter((n) => n.deletedAt === null)), targets)
        : [],
    [nodes, targets],
  );
  const entryOptions = useMemo<EntryOption[]>(() => {
    if (!codex.data) return [];
    const names = new Map(codex.data.categories.map((c) => [c.id, c.name]));
    return codex.data.entries.map((e) => ({
      id: e.id,
      title: e.title,
      category: names.get(e.categoryId) ?? '',
    }));
  }, [codex.data]);

  // MAP-07: a section link opens the section in the Manuscript view; a codex link opens its entry.
  const openLink = useCallback(
    (link: MapLink) =>
      navigate(
        link.type === 'node'
          ? `/book/${bookId}/manuscript/${link.id}`
          : `/book/${bookId}/codex/${link.id}`,
      ),
    [bookId, navigate],
  );

  if (maps.error || codex.error || treeFailed) {
    return (
      <p className={styles.placeholder} role="alert">
        The maps could not be loaded.
      </p>
    );
  }
  if (!maps.data) return <p className={styles.placeholder}>Loading…</p>;

  const ready = targets && entryTitles;

  return (
    <div className={styles.view}>
      <MapList bookId={bookId} maps={maps.data} selectedId={selected?.id} />
      <main className={styles.main}>
        {selected && ready ? (
          <MapCanvas
            key={selected.id}
            bookId={bookId}
            map={selected}
            sectionTargets={targets}
            entryTitles={entryTitles}
            sectionOptions={sectionOptions}
            entryOptions={entryOptions}
            onOpenLink={openLink}
          />
        ) : (
          <p className={styles.placeholder}>
            {selected
              ? 'Loading…'
              : maps.data.length === 0
                ? 'Create a map to start planning your story.'
                : 'Select a map.'}
          </p>
        )}
      </main>
    </div>
  );
}

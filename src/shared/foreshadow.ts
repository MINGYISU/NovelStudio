import type { Occurrence, Thread } from './schemas/foreshadow.ts';
import { DEFAULT_DORMANT_AFTER } from './schemas/foreshadow.ts';
import { buildTree, type TreeBranch } from './tree.ts';
import type { TreeNode } from './types.ts';

export const WARNING_KINDS = [
  'PAYOFF_BEFORE_SETUP',
  'PAYOFF_WITHOUT_SETUP',
  'SETUP_WITHOUT_PAYOFF',
  'DORMANT',
  'ORPHANED',
] as const;
export type WarningKind = (typeof WARNING_KINDS)[number];

/** `info` warnings (a setup still waiting for its payoff) are normal while a book is in progress. */
export type WarningLevel = 'warning' | 'info';

const LEVELS: Record<WarningKind, WarningLevel> = {
  PAYOFF_BEFORE_SETUP: 'warning',
  PAYOFF_WITHOUT_SETUP: 'warning',
  SETUP_WITHOUT_PAYOFF: 'info',
  DORMANT: 'warning',
  ORPHANED: 'warning',
};

export interface ForeshadowWarning {
  /** One warning per thread and kind, so the id stays stable while sections move. */
  id: string;
  threadId: string;
  kind: WarningKind;
  level: WarningLevel;
  /** The thread's title, so the client can build the message in the interface language (I18N-07). */
  threadTitle: string;
  /** English fallback; the client translates from `kind` and `threadTitle`. */
  message: string;
  /** Sections to mark with a badge. */
  nodeIds: string[];
  occurrenceIds: string[];
}

export interface ReadingPosition {
  /** Index among all live sections in reading order. */
  order: number;
  /** Number of numbered chapters at or before this section (a scene counts as its chapter). */
  chapterIndex: number;
}

/** Live sections in reading order (depth-first, pre-order) with their positions. */
export function computeReadingOrder(nodes: readonly TreeNode[]): {
  ordered: TreeNode[];
  positions: Map<string, ReadingPosition>;
} {
  const ordered: TreeNode[] = [];
  const positions = new Map<string, ReadingPosition>();
  let chapters = 0;
  const walk = (branches: TreeBranch<TreeNode>[]): void => {
    for (const { node, children } of branches) {
      if (node.kind === 'chapter' && node.numbered) chapters += 1;
      positions.set(node.id, { order: ordered.length, chapterIndex: chapters });
      ordered.push(node);
      walk(children);
    }
  };
  walk(buildTree(nodes));
  return { ordered, positions };
}

export interface AnalysisOptions {
  dormantAfter?: number;
}

export function warningMessage(kind: WarningKind, threadTitle: string): string {
  switch (kind) {
    case 'PAYOFF_BEFORE_SETUP':
      return `“${threadTitle}”: a payoff comes before its first setup.`;
    case 'PAYOFF_WITHOUT_SETUP':
      return `“${threadTitle}”: it has a payoff but no setup.`;
    case 'SETUP_WITHOUT_PAYOFF':
      return `“${threadTitle}”: it has a setup but no payoff yet.`;
    case 'DORMANT':
      return `“${threadTitle}”: it goes dormant for a long stretch of chapters.`;
    case 'ORPHANED':
      return `“${threadTitle}”: it points to a section that is trashed or missing.`;
  }
}

/** Pure check of every thread against the current reading order (PRD FS-05). */
export function analyzeForeshadows(
  nodes: readonly TreeNode[],
  threads: readonly Thread[],
  options: AnalysisOptions = {},
): ForeshadowWarning[] {
  const dormantAfter = options.dormantAfter ?? DEFAULT_DORMANT_AFTER;
  const { positions } = computeReadingOrder(nodes);
  const warnings: ForeshadowWarning[] = [];

  const add = (
    thread: Thread,
    kind: WarningKind,
    occurrences: readonly Occurrence[],
    nodeIds: readonly (string | null)[] = occurrences.map((o) => o.nodeId),
  ): void => {
    warnings.push({
      id: `${thread.id}:${kind}`,
      threadId: thread.id,
      kind,
      level: LEVELS[kind],
      threadTitle: thread.title,
      message: warningMessage(kind, thread.title),
      nodeIds: [...new Set(nodeIds.filter((id): id is string => id !== null))],
      occurrenceIds: occurrences.map((o) => o.id),
    });
  };

  for (const thread of threads) {
    const orphaned: Occurrence[] = [];
    const live: { occurrence: Occurrence; position: ReadingPosition }[] = [];
    for (const occurrence of thread.occurrences) {
      const position = occurrence.nodeId === null ? undefined : positions.get(occurrence.nodeId);
      if (position) live.push({ occurrence, position });
      else orphaned.push(occurrence);
    }
    live.sort((a, b) => a.position.order - b.position.order);

    if (orphaned.length > 0) add(thread, 'ORPHANED', orphaned);

    const setups = live.filter((x) => x.occurrence.role === 'setup');
    const payoffs = live.filter((x) => x.occurrence.role === 'payoff');
    const firstSetup = setups[0];
    const firstPayoff = payoffs[0];

    if (payoffs.length > 0 && !firstSetup) {
      add(
        thread,
        'PAYOFF_WITHOUT_SETUP',
        payoffs.map((x) => x.occurrence),
      );
    }
    if (firstSetup && firstPayoff && firstPayoff.position.order < firstSetup.position.order) {
      const early = payoffs.filter((x) => x.position.order < firstSetup.position.order);
      add(thread, 'PAYOFF_BEFORE_SETUP', [
        ...early.map((x) => x.occurrence),
        firstSetup.occurrence,
      ]);
    }
    if (setups.length > 0 && payoffs.length === 0 && thread.status !== 'abandoned') {
      add(
        thread,
        'SETUP_WITHOUT_PAYOFF',
        setups.map((x) => x.occurrence),
      );
    }

    const gaps: Occurrence[] = [];
    for (let i = 1; i < live.length; i += 1) {
      const before = live[i - 1];
      const after = live[i];
      if (
        before &&
        after &&
        after.position.chapterIndex - before.position.chapterIndex > dormantAfter
      ) {
        gaps.push(before.occurrence, after.occurrence);
      }
    }
    if (gaps.length > 0) add(thread, 'DORMANT', [...new Map(gaps.map((o) => [o.id, o])).values()]);
  }
  return warnings;
}

/** Warnings present in `next` whose thread and kind were not already warned about in `previous`. */
export function newWarnings(
  previous: readonly ForeshadowWarning[],
  next: readonly ForeshadowWarning[],
): ForeshadowWarning[] {
  const seen = new Set(previous.map((w) => w.id));
  return next.filter((w) => !seen.has(w.id));
}

/** Warnings per section, for the sidebar badges. */
export function warningsByNode(
  warnings: readonly ForeshadowWarning[],
): Map<string, ForeshadowWarning[]> {
  const byNode = new Map<string, ForeshadowWarning[]>();
  for (const warning of warnings) {
    for (const nodeId of warning.nodeIds) {
      const list = byNode.get(nodeId);
      if (list) list.push(warning);
      else byNode.set(nodeId, [warning]);
    }
  }
  return byNode;
}

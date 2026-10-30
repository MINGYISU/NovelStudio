import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { computeReadingOrder, type ForeshadowWarning } from '../../../shared/foreshadow.ts';
import { sectionTargets } from '../../../shared/map-links.ts';
import { DORMANT_AFTER_MAX, type Thread } from '../../../shared/schemas/foreshadow.ts';
import type { StructureSettings } from '../../../shared/schemas/structure.ts';
import type { TreeNode } from '../../../shared/types.ts';
import { useUpdateBook } from '../../api/books.ts';
import { Button, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { MatrixView } from './MatrixView.tsx';
import { ThreadDialog } from './ThreadDialog.tsx';
import { ThreadList } from './ThreadList.tsx';
import { sectionOptions } from './sections.ts';
import styles from './foreshadow.module.css';

interface ForeshadowViewProps {
  bookId: string;
  nodes: TreeNode[] | undefined;
  structure: StructureSettings;
  dormantAfter: number;
  threads: Thread[] | undefined;
  warnings: ForeshadowWarning[];
  failed: boolean;
}

type Mode = 'threads' | 'matrix';

/** The Foreshadowing view (PRD §7): thread list or matrix, warnings, and the dormancy setting. */
export function ForeshadowView({
  bookId,
  nodes,
  structure,
  dormantAfter,
  threads,
  warnings,
  failed,
}: ForeshadowViewProps) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('threads');
  const [creating, setCreating] = useState(false);

  const targets = useMemo(
    () => (nodes ? sectionTargets(nodes, structure, t('common.untitled')) : null),
    [nodes, structure, t],
  );
  const reading = useMemo(() => (nodes ? computeReadingOrder(nodes) : null), [nodes]);
  const order = useMemo(() => new Map(reading?.ordered.map((n, i) => [n.id, i]) ?? []), [reading]);
  const options = useMemo(
    () => (nodes && targets ? sectionOptions(nodes, targets) : []),
    [nodes, targets],
  );
  const warningCount = warnings.filter((w) => w.level === 'warning').length;

  return (
    <main className={styles.view} aria-label={t('foreshadow.view.label')}>
      <header className={styles.toolbar}>
        <h2 className={styles.heading}>{t('foreshadow.view.heading')}</h2>
        <div
          className={styles.segmented}
          role="tablist"
          aria-label={t('foreshadow.view.displayLabel')}
        >
          {(
            [
              ['threads', t('foreshadow.view.modeThreads')],
              ['matrix', t('foreshadow.view.modeMatrix')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`${styles.segment} ${mode === value ? styles.segmentActive : ''}`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={styles.summary} data-testid="warning-summary">
          {warningCount === 0
            ? t('foreshadow.view.noWarnings')
            : t('foreshadow.view.warnings', { count: warningCount })}
        </span>
        <span className={styles.spacer} />
        <DormantSetting key={dormantAfter} bookId={bookId} value={dormantAfter} />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> {t('foreshadow.view.newThread')}
        </Button>
      </header>
      <div className={styles.content}>
        {failed ? (
          <p className={styles.error} role="alert">
            {t('foreshadow.view.loadFailed')}
          </p>
        ) : !threads || !nodes || !targets || !reading ? (
          <p className={styles.empty}>{t('common.loading')}</p>
        ) : mode === 'threads' ? (
          <ThreadList
            bookId={bookId}
            threads={threads}
            warnings={warnings}
            targets={targets}
            order={order}
            options={options}
          />
        ) : (
          <MatrixView
            bookId={bookId}
            threads={threads}
            warnings={warnings}
            sections={reading.ordered}
            targets={targets}
          />
        )}
      </div>
      {creating ? <ThreadDialog bookId={bookId} onClose={() => setCreating(false)} /> : null}
    </main>
  );
}

/** FS-05d: the number of chapters a thread may stay silent before it is flagged as dormant. */
function DormantSetting({ bookId, value }: { bookId: string; value: number }) {
  const t = useT();
  const update = useUpdateBook();
  const [text, setText] = useState(String(value));

  const commit = () => {
    const next = Number(text);
    if (!Number.isInteger(next) || next < 1 || next > DORMANT_AFTER_MAX) {
      setText(String(value));
      return;
    }
    if (next === value) return;
    update.mutate(
      { id: bookId, patch: { foreshadow: { dormantAfter: next } } },
      {
        onError: (error) => {
          setText(String(value));
          useWorkspaceStore.getState().notify({
            tone: 'error',
            message: t('foreshadow.dormant.saveFailed', { reason: apiErrorMessage(error) }),
          });
        },
      },
    );
  };

  return (
    <label className={styles.dormant}>
      <span>{t('foreshadow.dormant.label')}</span>
      <input
        className={`${uiStyles.input} ${styles.dormantInput}`}
        type="number"
        min={1}
        max={DORMANT_AFTER_MAX}
        step={1}
        value={text}
        aria-label={t('foreshadow.dormant.ariaLabel')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span>{t('foreshadow.dormant.unit')}</span>
    </label>
  );
}

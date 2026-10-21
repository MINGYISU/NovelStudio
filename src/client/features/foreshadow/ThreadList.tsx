import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import type { LinkTarget } from '../../../shared/map-links.ts';
import {
  ROLE_GLYPHS,
  ROLE_LABELS,
  STATUS_LABELS,
  type Occurrence,
  type Thread,
} from '../../../shared/schemas/foreshadow.ts';
import { useDeleteOccurrence, useDeleteThread } from '../../api/foreshadows.ts';
import { reportCodexError } from '../codex/errors.ts';
import { Button, Dialog, uiStyles } from '../../components/ui.tsx';
import { OccurrenceDialog } from './OccurrenceDialog.tsx';
import { ThreadDialog } from './ThreadDialog.tsx';
import { describeSection, type SectionOption } from './sections.ts';
import styles from './foreshadow.module.css';

interface ThreadListProps {
  bookId: string;
  threads: readonly Thread[];
  warnings: readonly ForeshadowWarning[];
  targets: ReadonlyMap<string, LinkTarget>;
  /** Reading-order index of every live section. */
  order: ReadonlyMap<string, number>;
  options: readonly SectionOption[];
}

/** FS-03: every thread with its occurrences in the current reading order. */
export function ThreadList({
  bookId,
  threads,
  warnings,
  targets,
  order,
  options,
}: ThreadListProps) {
  const [editing, setEditing] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const [adding, setAdding] = useState<Thread | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<{
    thread: Thread;
    occurrence: Occurrence;
  } | null>(null);
  const deleteThread = useDeleteThread(bookId);
  const deleteOccurrence = useDeleteOccurrence(bookId);

  const warningsOf = useMemo(() => {
    const map = new Map<string, ForeshadowWarning[]>();
    for (const w of warnings) map.set(w.threadId, [...(map.get(w.threadId) ?? []), w]);
    return map;
  }, [warnings]);

  if (threads.length === 0) {
    return (
      <p className={styles.empty}>
        No threads yet. A thread is one planted idea; add its setup, hints and payoff here.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.threadList}>
        {threads.map((thread) => {
          const sorted = [...thread.occurrences].sort(
            (a, b) =>
              (a.nodeId !== null ? (order.get(a.nodeId) ?? Infinity) : Infinity) -
              (b.nodeId !== null ? (order.get(b.nodeId) ?? Infinity) : Infinity),
          );
          return (
            <li
              key={thread.id}
              className={styles.thread}
              data-testid="thread"
              data-thread-id={thread.id}
            >
              <header className={styles.threadHeader}>
                <span
                  className={styles.swatch}
                  style={{ background: thread.color }}
                  aria-hidden="true"
                />
                <h3 className={styles.threadTitle}>{thread.title}</h3>
                <span className={`${styles.status} ${styles[`status_${thread.status}`]}`}>
                  {STATUS_LABELS[thread.status]}
                </span>
                <span className={styles.spacer} />
                <Button onClick={() => setAdding(thread)}>
                  <Plus size={14} /> Occurrence
                </Button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Edit thread ${thread.title}`}
                  onClick={() => setEditing(thread)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Delete thread ${thread.title}`}
                  onClick={() => setDeleting(thread)}
                >
                  <Trash2 size={14} />
                </button>
              </header>
              {thread.description ? (
                <p className={styles.threadDescription}>{thread.description}</p>
              ) : null}
              {(warningsOf.get(thread.id) ?? []).map((w) => (
                <p
                  key={w.id}
                  className={`${styles.warning} ${w.level === 'info' ? styles.warningInfo : ''}`}
                  data-testid="thread-warning"
                  data-kind={w.kind}
                >
                  {w.message}
                </p>
              ))}
              {sorted.length === 0 ? (
                <p className={styles.empty}>No occurrences yet.</p>
              ) : (
                <ol className={styles.occurrences}>
                  {sorted.map((o) => {
                    const section = describeSection(o.nodeId, targets);
                    return (
                      <li key={o.id} className={styles.occurrence} data-role={o.role}>
                        <span
                          className={styles.glyph}
                          role="img"
                          aria-label={ROLE_LABELS[o.role]}
                          title={ROLE_LABELS[o.role]}
                        >
                          {ROLE_GLYPHS[o.role]}
                        </span>
                        <div className={styles.occurrenceBody}>
                          <div>
                            <span className={styles.roleLabel}>{ROLE_LABELS[o.role]}</span>
                            {' · '}
                            {section.state === 'ok' && o.nodeId ? (
                              <Link
                                className={styles.sectionLink}
                                to={`/book/${bookId}/manuscript/${o.nodeId}`}
                              >
                                {section.label}
                              </Link>
                            ) : (
                              <span className={styles.missing}>{section.label}</span>
                            )}
                          </div>
                          {o.anchorState === 'missing' ? (
                            <p className={styles.anchorMissing} data-testid="anchor-missing">
                              Anchor missing: the marked text was deleted.
                            </p>
                          ) : null}
                          {o.excerpt ? (
                            <blockquote className={styles.excerpt}>{o.excerpt}</blockquote>
                          ) : null}
                          {o.note ? <p className={styles.note}>{o.note}</p> : null}
                        </div>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Edit ${ROLE_LABELS[o.role]} occurrence`}
                          onClick={() => setEditingOccurrence({ thread, occurrence: o })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Remove ${ROLE_LABELS[o.role]} occurrence`}
                          onClick={() =>
                            deleteOccurrence.mutate(o.id, {
                              onError: reportCodexError('Could not remove the occurrence.'),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
      {editing ? (
        <ThreadDialog bookId={bookId} thread={editing} onClose={() => setEditing(null)} />
      ) : null}
      {adding ? (
        <OccurrenceDialog
          bookId={bookId}
          thread={adding}
          options={options}
          onClose={() => setAdding(null)}
        />
      ) : null}
      {editingOccurrence ? (
        <OccurrenceDialog
          bookId={bookId}
          thread={editingOccurrence.thread}
          occurrence={editingOccurrence.occurrence}
          options={options}
          onClose={() => setEditingOccurrence(null)}
        />
      ) : null}
      {deleting ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete this thread?"
          description={`“${deleting.title}” and its ${deleting.occurrences.length} occurrence(s) will be removed. Your manuscript text is not touched.`}
        >
          <div className={uiStyles.actions}>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={deleteThread.isPending}
              onClick={() =>
                deleteThread.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                  onError: reportCodexError('Could not delete the thread.'),
                })
              }
            >
              Delete thread
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

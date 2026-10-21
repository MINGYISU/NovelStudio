import { Link } from 'react-router';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import { ROLE_GLYPHS, ROLE_LABELS, type Thread } from '../../../shared/schemas/foreshadow.ts';
import styles from './foreshadow.module.css';

interface SectionThreadsProps {
  bookId: string;
  nodeId: string;
  threads: readonly Thread[] | undefined;
  warnings: readonly ForeshadowWarning[];
}

/** FS-07: the threads that occur in the selected section, with their role here. */
export function SectionThreads({ bookId, nodeId, threads, warnings }: SectionThreadsProps) {
  const here = (threads ?? [])
    .map((thread) => ({
      thread,
      occurrences: thread.occurrences.filter((o) => o.nodeId === nodeId),
    }))
    .filter((x) => x.occurrences.length > 0);

  return (
    <section className={styles.sectionThreads} aria-label="Foreshadowing in this section">
      <h3 className={styles.sectionThreadsHeading}>Foreshadowing in this section</h3>
      {threads === undefined ? (
        <p className={styles.empty}>Loading…</p>
      ) : here.length === 0 ? (
        <p className={styles.empty}>No threads occur here.</p>
      ) : (
        <ul className={styles.sectionThreadList}>
          {here.map(({ thread, occurrences }) => {
            const flagged = warnings.some(
              (w) =>
                w.threadId === thread.id && w.level === 'warning' && w.nodeIds.includes(nodeId),
            );
            return (
              <li key={thread.id} data-testid="section-thread">
                <Link className={styles.sectionThreadLink} to={`/book/${bookId}/foreshadow`}>
                  <span
                    className={styles.swatch}
                    style={{ background: thread.color }}
                    aria-hidden="true"
                  />
                  <span className={styles.sectionThreadTitle}>{thread.title}</span>
                  <span className={styles.sectionThreadRoles}>
                    {occurrences.map((o) => (
                      <span
                        key={o.id}
                        role="img"
                        aria-label={ROLE_LABELS[o.role]}
                        title={ROLE_LABELS[o.role]}
                      >
                        {ROLE_GLYPHS[o.role]}
                      </span>
                    ))}
                  </span>
                  {occurrences.some((o) => o.anchorState === 'missing') ? (
                    <span
                      className={styles.anchorMissingTag}
                      data-testid="anchor-missing"
                      title="The marked text of an occurrence was deleted"
                    >
                      anchor missing
                    </span>
                  ) : null}
                  {flagged ? (
                    <span
                      className={styles.badge}
                      title="This thread has a warning here"
                      aria-label="Warning"
                    >
                      !
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

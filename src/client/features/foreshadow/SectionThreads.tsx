import { Link } from 'react-router';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import { ROLE_GLYPHS, type Thread } from '../../../shared/schemas/foreshadow.ts';
import { useT } from '../../i18n/index.ts';
import styles from './foreshadow.module.css';
import { roleLabel } from './labels.ts';

interface SectionThreadsProps {
  bookId: string;
  nodeId: string;
  threads: readonly Thread[] | undefined;
  warnings: readonly ForeshadowWarning[];
}

/** FS-07: the threads that occur in the selected section, with their role here. */
export function SectionThreads({ bookId, nodeId, threads, warnings }: SectionThreadsProps) {
  const t = useT();
  const here = (threads ?? [])
    .map((thread) => ({
      thread,
      occurrences: thread.occurrences.filter((o) => o.nodeId === nodeId),
    }))
    .filter((x) => x.occurrences.length > 0);

  return (
    <section className={styles.sectionThreads} aria-label={t('foreshadow.sectionThreads.heading')}>
      <h3 className={styles.sectionThreadsHeading}>{t('foreshadow.sectionThreads.heading')}</h3>
      {threads === undefined ? (
        <p className={styles.empty}>{t('common.loading')}</p>
      ) : here.length === 0 ? (
        <p className={styles.empty}>{t('foreshadow.sectionThreads.none')}</p>
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
                        aria-label={roleLabel(t, o.role)}
                        title={roleLabel(t, o.role)}
                      >
                        {ROLE_GLYPHS[o.role]}
                      </span>
                    ))}
                  </span>
                  {occurrences.some((o) => o.anchorState === 'missing') ? (
                    <span
                      className={styles.anchorMissingTag}
                      data-testid="anchor-missing"
                      title={t('foreshadow.sectionThreads.anchorMissingTitle')}
                    >
                      {t('foreshadow.sectionThreads.anchorMissing')}
                    </span>
                  ) : null}
                  {flagged ? (
                    <span
                      className={styles.badge}
                      title={t('foreshadow.sectionThreads.warningTitle')}
                      aria-label={t('foreshadow.sectionThreads.warningLabel')}
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

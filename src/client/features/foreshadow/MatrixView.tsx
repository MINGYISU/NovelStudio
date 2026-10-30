import { Link } from 'react-router';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import type { LinkTarget } from '../../../shared/map-links.ts';
import {
  ROLE_GLYPHS,
  type OccurrenceRole,
  type Thread,
} from '../../../shared/schemas/foreshadow.ts';
import { useT } from '../../i18n/index.ts';
import styles from './foreshadow.module.css';
import { roleLabel } from './labels.ts';

interface MatrixViewProps {
  bookId: string;
  threads: readonly Thread[];
  warnings: readonly ForeshadowWarning[];
  /** Live sections in reading order. */
  sections: readonly { id: string; numbered: boolean }[];
  targets: ReadonlyMap<string, LinkTarget>;
}

const ROLE_ORDER: OccurrenceRole[] = ['setup', 'hint', 'payoff'];

/**
 * FS-04: rows are threads, columns are the numbered sections in reading order (plus any
 * unnumbered section that holds an occurrence). A filled cell jumps to that section.
 */
export function MatrixView({ bookId, threads, warnings, sections, targets }: MatrixViewProps) {
  const t = useT();
  const used = new Set(threads.flatMap((thread) => thread.occurrences.map((o) => o.nodeId)));
  const columns = sections.filter((s) => s.numbered || used.has(s.id));
  const live = new Set(sections.map((s) => s.id));

  if (threads.length === 0) {
    return <p className={styles.empty}>{t('foreshadow.matrix.empty')}</p>;
  }

  return (
    <div className={styles.matrixScroll}>
      <table className={styles.matrix} data-testid="matrix">
        <thead>
          <tr>
            <th className={styles.matrixCorner} scope="col">
              {t('foreshadow.matrix.thread')}
            </th>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={styles.matrixColumn} data-node-id={c.id}>
                <span title={targets.get(c.id)?.title}>{targets.get(c.id)?.title}</span>
              </th>
            ))}
            <th scope="col" className={styles.matrixColumn}>
              <span>{t('foreshadow.matrix.trashMissing')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {threads.map((thread) => {
            const flagged = new Set(
              warnings.filter((w) => w.threadId === thread.id).flatMap((w) => w.nodeIds),
            );
            const orphaned = thread.occurrences.filter(
              (o) => o.nodeId === null || !live.has(o.nodeId),
            );
            return (
              <tr key={thread.id} data-thread-id={thread.id}>
                <th scope="row" className={styles.matrixRowHeader}>
                  <span
                    className={styles.swatch}
                    style={{ background: thread.color }}
                    aria-hidden="true"
                  />
                  {thread.title}
                </th>
                {columns.map((c) => {
                  const roles = ROLE_ORDER.filter((r) =>
                    thread.occurrences.some((o) => o.nodeId === c.id && o.role === r),
                  );
                  const label = targets.get(c.id)?.title ?? '';
                  const roleNames = roles
                    .map((r) => roleLabel(t, r))
                    .join(t('foreshadow.matrix.listSeparator'));
                  return (
                    <td
                      key={c.id}
                      className={`${styles.matrixCell} ${flagged.has(c.id) ? styles.matrixFlagged : ''}`}
                    >
                      {roles.length > 0 ? (
                        <Link
                          className={styles.matrixLink}
                          to={`/book/${bookId}/manuscript/${c.id}`}
                          data-testid="matrix-cell"
                          data-roles={roles.join(' ')}
                          aria-label={t('foreshadow.matrix.cellLabel', {
                            thread: thread.title,
                            roles: roleNames,
                            section: label,
                          })}
                          title={t('foreshadow.matrix.cellTitle', {
                            roles: roleNames,
                            section: label,
                          })}
                        >
                          {roles.map((r) => ROLE_GLYPHS[r]).join('')}
                        </Link>
                      ) : null}
                    </td>
                  );
                })}
                <td className={styles.matrixCell}>
                  {orphaned.length > 0 ? (
                    <span className={styles.missing} title={t('foreshadow.matrix.orphanedTitle')}>
                      ⚠ {orphaned.length}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

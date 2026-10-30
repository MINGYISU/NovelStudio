import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { findMentionedCharacters, isCharacterCategory } from '../../../shared/codex.ts';
import { docToPlainText } from '../../../shared/prosemirror-text.ts';
import { useCodex } from '../../api/codex.ts';
import { fetchNodeContent } from '../../api/content.ts';
import { useT } from '../../i18n/index.ts';
import { saverRegistry } from '../editor/save-registry.ts';
import styles from './codex.module.css';

/** The section's saved text; refetched whenever an autosave of this section finishes. */
function useSectionText(nodeId: string): string | undefined {
  const client = useQueryClient();
  const key = ['section-text', nodeId] as const;
  useEffect(
    () =>
      saverRegistry.onSaved((id) => {
        if (id === nodeId) void client.invalidateQueries({ queryKey: ['section-text', nodeId] });
      }),
    [client, nodeId],
  );
  const query = useQuery({
    queryKey: key,
    gcTime: 0,
    queryFn: async ({ signal }) => docToPlainText((await fetchNodeContent(nodeId, signal)).content),
  });
  return query.data;
}

/** CDX-07: characters from the codex whose names appear in the selected section. */
export function CharactersInSection({ bookId, nodeId }: { bookId: string; nodeId: string }) {
  const t = useT();
  const codex = useCodex(bookId);
  const text = useSectionText(nodeId);

  const mentioned = useMemo(() => {
    if (!codex.data || text === undefined) return [];
    const characterCategories = new Set(
      codex.data.categories.filter(isCharacterCategory).map((c) => c.id),
    );
    const characters = codex.data.entries.filter((e) => characterCategories.has(e.categoryId));
    return findMentionedCharacters(characters, text);
  }, [codex.data, text]);

  return (
    <section className={styles.characters} aria-label={t('codex.characters.title')}>
      <h3 className={styles.charactersHeading}>{t('codex.characters.title')}</h3>
      {text === undefined || codex.isPending ? (
        <p className={styles.empty}>{t('common.loading')}</p>
      ) : mentioned.length === 0 ? (
        <p className={styles.empty}>{t('codex.characters.none')}</p>
      ) : (
        <ul className={styles.characterList}>
          {mentioned.map((entry) => (
            <li key={entry.id}>
              <Link className={styles.characterLink} to={`/book/${bookId}/codex/${entry.id}`}>
                <span className={styles.avatar}>
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">{Array.from(entry.title)[0] ?? '?'}</span>
                  )}
                </span>
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

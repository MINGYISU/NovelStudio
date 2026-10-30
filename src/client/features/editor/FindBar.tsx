import { useEditorState, type Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatNumber, useT } from '../../i18n/index.ts';
import { clearFind, getFindState, setFindQuery, stepFind } from './find-extension.ts';
import styles from './editor.module.css';

/** Find in section (ED-08): Enter / Shift+Enter step through matches, Escape closes. */
export function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { total, current } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const state = getFindState(e);
      return { total: state.matches.length, current: state.current };
    },
  });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => () => clearFind(editor), [editor]);

  const search = (next: string, sensitive: boolean) => {
    setQuery(next);
    setCaseSensitive(sensitive);
    setFindQuery(editor, next, sensitive);
  };

  return (
    <div className={styles.findBar} role="search">
      <input
        ref={input}
        className={styles.findInput}
        value={query}
        placeholder={t('editor.find.placeholder')}
        aria-label={t('editor.find.placeholder')}
        onChange={(e) => search(e.target.value, caseSensitive)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            stepFind(editor, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button
        type="button"
        className={styles.tool}
        aria-label={t('editor.find.previous')}
        onClick={() => stepFind(editor, -1)}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-label={t('editor.find.next')}
        onClick={() => stepFind(editor, 1)}
      >
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-label={t('editor.find.matchCase')}
        aria-pressed={caseSensitive}
        onClick={() => search(query, !caseSensitive)}
      >
        {t('editor.find.matchCaseButton')}
      </button>
      <span className={styles.findCount} aria-live="polite">
        {query === ''
          ? ''
          : total === 0
            ? t('editor.find.noMatches')
            : t('editor.find.position', {
                current: formatNumber(current + 1),
                total: formatNumber(total),
              })}
      </span>
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.tool}
        aria-label={t('editor.find.close')}
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}

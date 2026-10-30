import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import { NODE_TITLE_MAX } from '../../../shared/schemas/node.ts';
import { useT } from '../../i18n/index.ts';
import { warningText } from '../foreshadow/warning-text.ts';
import { childKindOf, type TreeItem } from './build-items.ts';
import { useSectionWarnings, useSidebarActions } from './sidebar-context.ts';
import styles from './manuscript.module.css';

const AUTO_EXPAND_MS = 600;

export function TreeRow({ node, style, dragHandle }: NodeRendererProps<TreeItem>) {
  const t = useT();
  const actions = useSidebarActions();
  const { node: section, displayTitle } = node.data;
  const warnings = useSectionWarnings(section.id);
  const childKind = childKindOf(section.kind);
  const hasChildren = (node.data.children?.length ?? 0) > 0;

  // MOVE-10: hovering a collapsed parent during a drag opens it after a short delay.
  const hoveredClosed = node.willReceiveDrop && node.isClosed;
  const { tree, id } = node;
  useEffect(() => {
    if (!hoveredClosed) return;
    const timer = setTimeout(() => tree.open(id), AUTO_EXPAND_MS);
    return () => clearTimeout(timer);
  }, [hoveredClosed, tree, id]);

  const className = [
    styles.row,
    node.isSelected ? styles.rowSelected : '',
    node.willReceiveDrop ? styles.rowDropTarget : '',
    node.isDragging ? styles.rowDragging : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div style={style} onContextMenu={() => node.select()}>
          <div
            ref={dragHandle}
            className={className}
            title={section.synopsis || undefined}
            data-testid="tree-row"
            data-node-id={section.id}
            onDoubleClick={() => void node.edit()}
          >
            {hasChildren ? (
              <button
                type="button"
                className={styles.fold}
                aria-label={
                  node.isOpen ? t('manuscript.tree.collapse') : t('manuscript.tree.expand')
                }
                onClick={(e) => {
                  e.stopPropagation();
                  node.toggle();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <ChevronRight size={14} className={node.isOpen ? styles.foldOpen : undefined} />
              </button>
            ) : (
              <span className={styles.foldSpacer} />
            )}
            <span
              className={`${styles.dot} ${styles[`status_${section.status}`]}`}
              role="img"
              aria-label={t('manuscript.tree.status', { status: t(`status.${section.status}`) })}
            />
            {node.isEditing ? (
              <TitleEditor
                initial={section.title}
                placeholder={displayTitle}
                onSubmit={(value) => node.submit(value)}
                onCancel={() => node.reset()}
              />
            ) : (
              <>
                <span
                  className={`${styles.title} ${section.numbered || section.title ? '' : styles.untitled}`}
                  data-kind={section.kind}
                >
                  {displayTitle}
                </span>
                {warnings && warnings.length > 0 ? (
                  <span
                    className={`${styles.badge} ${warnings.some((w) => w.level === 'warning') ? '' : styles.badgeInfo}`}
                    data-testid="foreshadow-badge"
                    data-kinds={warnings.map((w) => w.kind).join(' ')}
                    title={warnings.map((w) => warningText(t, w)).join('\n')}
                    role="img"
                    aria-label={t('manuscript.tree.warnings', { count: warnings.length })}
                  >
                    {warnings.length}
                  </span>
                ) : null}
                <span className={styles.words}>
                  {t('manuscript.tree.words', { count: section.wordCount })}
                </span>
              </>
            )}
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles.menu}>
          <ContextMenu.Item
            className={styles.menuItem}
            onSelect={() => actions.createSibling(section)}
          >
            {t('manuscript.tree.newAfter', { kind: t(`kind.${section.kind}`).toLowerCase() })}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            disabled={childKind === null}
            onSelect={() => {
              node.open();
              actions.createChild(section);
            }}
          >
            {t('manuscript.tree.newInside', {
              kind: childKind ? t(`kind.${childKind}`).toLowerCase() : t('manuscript.tree.child'),
            })}
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={() => void node.edit()}>
            {t('common.rename')}
            {/* eslint-disable-next-line no-restricted-syntax -- keyboard key name */}
            <span className={styles.shortcut}>F2</span>
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={() => actions.duplicate(section)}>
            {t('common.duplicate')}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            onSelect={() => actions.setNumbered(section, !section.numbered)}
          >
            {section.numbered ? t('manuscript.tree.unnumber') : t('manuscript.tree.number')}
          </ContextMenu.Item>
          <ContextMenu.Separator className={styles.menuSeparator} />
          <ContextMenu.Item
            className={`${styles.menuItem} ${styles.menuDanger}`}
            onSelect={() => actions.trash(section)}
          >
            {t('manuscript.tree.moveToTrash')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface TitleEditorProps {
  initial: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function TitleEditor({ initial, placeholder, onSubmit, onCancel }: TitleEditorProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onSubmit(value);
    else onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') finish(false);
  };

  return (
    <input
      ref={input}
      className={styles.renameInput}
      aria-label={t('manuscript.tree.sectionTitle')}
      value={value}
      maxLength={NODE_TITLE_MAX}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

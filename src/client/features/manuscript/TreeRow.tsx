import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import { NODE_TITLE_MAX } from '../../../shared/schemas/node.ts';
import { childKindOf, type TreeItem } from './build-items.ts';
import { useSidebarActions } from './sidebar-context.ts';
import styles from './manuscript.module.css';

const AUTO_EXPAND_MS = 600;

export function TreeRow({ node, style, dragHandle }: NodeRendererProps<TreeItem>) {
  const actions = useSidebarActions();
  const { node: section, displayTitle } = node.data;
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
                aria-label={node.isOpen ? 'Collapse' : 'Expand'}
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
              aria-label={`Status: ${section.status}`}
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
                <span className={styles.words}>{section.wordCount.toLocaleString()} w</span>
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
            New {section.kind} after
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            disabled={childKindOf(section.kind) === null}
            onSelect={() => {
              node.open();
              actions.createChild(section);
            }}
          >
            New {childKindOf(section.kind) ?? 'child'} inside
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={() => void node.edit()}>
            Rename
            <span className={styles.shortcut}>F2</span>
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.menuItem} onSelect={() => actions.duplicate(section)}>
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            onSelect={() => actions.setNumbered(section, !section.numbered)}
          >
            {section.numbered ? 'Unnumber' : 'Number'}
          </ContextMenu.Item>
          <ContextMenu.Separator className={styles.menuSeparator} />
          <ContextMenu.Item
            className={`${styles.menuItem} ${styles.menuDanger}`}
            onSelect={() => actions.trash(section)}
          >
            Move to trash
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
      aria-label="Section title"
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

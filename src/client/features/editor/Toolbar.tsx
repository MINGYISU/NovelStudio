import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  History,
  Italic,
  Minus,
  Quote,
  Redo2,
  Search,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { HIGHLIGHT_COLORS } from '../../../shared/schemas/content.ts';
import libraryStyles from '../../pages/library/library.module.css';
import styles from './editor.module.css';

function Tool({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tool}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection in the editor when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  );
}

interface ToolbarProps {
  editor: Editor;
  editable: boolean;
  onFind: () => void;
  onSnapshots: () => void;
  onDisplay: () => void;
}

/** ED-02 formatting toolbar. Nothing here can produce formatting the schema does not allow. */
export function Toolbar({ editor, editable, onFind, onSnapshots, onDisplay }: ToolbarProps) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      justify: e.isActive({ textAlign: 'justify' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      <Tool
        label="Undo"
        icon={Undo2}
        disabled={!editable || !s.canUndo}
        onClick={() => run().undo().run()}
      />
      <Tool
        label="Redo"
        icon={Redo2}
        disabled={!editable || !s.canRedo}
        onClick={() => run().redo().run()}
      />
      <span className={styles.separator} />
      <Tool
        label="Bold"
        icon={Bold}
        active={s.bold}
        disabled={!editable}
        onClick={() => run().toggleBold().run()}
      />
      <Tool
        label="Italic"
        icon={Italic}
        active={s.italic}
        disabled={!editable}
        onClick={() => run().toggleItalic().run()}
      />
      <Tool
        label="Underline"
        icon={Underline}
        active={s.underline}
        disabled={!editable}
        onClick={() => run().toggleUnderline().run()}
      />
      <Tool
        label="Strikethrough"
        icon={Strikethrough}
        active={s.strike}
        disabled={!editable}
        onClick={() => run().toggleStrike().run()}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={!editable}>
          <button
            type="button"
            className={styles.tool}
            aria-label="Highlight"
            title="Highlight"
            aria-pressed={s.highlight}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Highlighter size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={libraryStyles.menu}
            sideOffset={4}
            onCloseAutoFocus={(e) => {
              // Typing continues where it was instead of jumping to the menu button.
              e.preventDefault();
              editor.commands.focus();
            }}
          >
            {HIGHLIGHT_COLORS.map((color) => (
              <DropdownMenu.Item
                key={color.value}
                className={libraryStyles.menuItem}
                onSelect={() => run().setHighlight({ color: color.value }).run()}
              >
                <span className={styles.swatch} style={{ background: color.value }} /> {color.name}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item
              className={libraryStyles.menuItem}
              onSelect={() => run().unsetHighlight().run()}
            >
              Remove highlight
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <span className={styles.separator} />
      <Tool
        label="Heading 1"
        icon={Heading1}
        active={s.h1}
        disabled={!editable}
        onClick={() => run().toggleHeading({ level: 1 }).run()}
      />
      <Tool
        label="Heading 2"
        icon={Heading2}
        active={s.h2}
        disabled={!editable}
        onClick={() => run().toggleHeading({ level: 2 }).run()}
      />
      <Tool
        label="Quote"
        icon={Quote}
        active={s.quote}
        disabled={!editable}
        onClick={() => run().toggleBlockquote().run()}
      />
      <Tool
        label="Scene break"
        icon={Minus}
        disabled={!editable}
        onClick={() => run().setHorizontalRule().run()}
      />
      <span className={styles.separator} />
      <Tool
        label="Align left"
        icon={AlignLeft}
        active={s.left}
        disabled={!editable}
        onClick={() => run().setTextAlign('left').run()}
      />
      <Tool
        label="Align center"
        icon={AlignCenter}
        active={s.center}
        disabled={!editable}
        onClick={() => run().setTextAlign('center').run()}
      />
      <Tool
        label="Align right"
        icon={AlignRight}
        active={s.right}
        disabled={!editable}
        onClick={() => run().setTextAlign('right').run()}
      />
      <Tool
        label="Justify"
        icon={AlignJustify}
        active={s.justify}
        disabled={!editable}
        onClick={() => run().setTextAlign('justify').run()}
      />
      <span className={styles.spacer} />
      <Tool label="Find in section" icon={Search} onClick={onFind} />
      <Tool label="Snapshots" icon={History} onClick={onSnapshots} />
      <Tool label="Display settings" icon={Type} onClick={onDisplay} />
    </div>
  );
}

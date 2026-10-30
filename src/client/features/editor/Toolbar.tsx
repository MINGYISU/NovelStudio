import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  EyeOff,
  Flag,
  Heading1,
  Heading2,
  Highlighter,
  History,
  ImagePlus,
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
import {
  OCCURRENCE_ROLES,
  ROLE_GLYPHS,
  type OccurrenceRole,
} from '../../../shared/schemas/foreshadow.ts';
import { useT, type MessageKey } from '../../i18n/index.ts';
import libraryStyles from '../../pages/library/library.module.css';
import styles from './editor.module.css';

const HIGHLIGHT_KEYS: Record<(typeof HIGHLIGHT_COLORS)[number]['name'], MessageKey> = {
  Yellow: 'editor.highlight.yellow',
  Green: 'editor.highlight.green',
  Blue: 'editor.highlight.blue',
  Pink: 'editor.highlight.pink',
  Orange: 'editor.highlight.orange',
};

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
  onInsertImage: () => void;
  /** FS-08: mark the selection as a setup, hint or payoff. */
  onMarkAnchor: (role: OccurrenceRole) => void;
  showAnchors: boolean;
  onToggleAnchors: () => void;
}

/** ED-02 formatting toolbar. Nothing here can produce formatting the schema does not allow. */
export function Toolbar({
  editor,
  editable,
  onFind,
  onSnapshots,
  onDisplay,
  onInsertImage,
  onMarkAnchor,
  showAnchors,
  onToggleAnchors,
}: ToolbarProps) {
  const t = useT();
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
      hasSelection: !e.state.selection.empty,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('editor.toolbar.label')}>
      <Tool
        label={t('editor.toolbar.undo')}
        icon={Undo2}
        disabled={!editable || !s.canUndo}
        onClick={() => run().undo().run()}
      />
      <Tool
        label={t('editor.toolbar.redo')}
        icon={Redo2}
        disabled={!editable || !s.canRedo}
        onClick={() => run().redo().run()}
      />
      <span className={styles.separator} />
      <Tool
        label={t('editor.toolbar.bold')}
        icon={Bold}
        active={s.bold}
        disabled={!editable}
        onClick={() => run().toggleBold().run()}
      />
      <Tool
        label={t('editor.toolbar.italic')}
        icon={Italic}
        active={s.italic}
        disabled={!editable}
        onClick={() => run().toggleItalic().run()}
      />
      <Tool
        label={t('editor.toolbar.underline')}
        icon={Underline}
        active={s.underline}
        disabled={!editable}
        onClick={() => run().toggleUnderline().run()}
      />
      <Tool
        label={t('editor.toolbar.strikethrough')}
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
            aria-label={t('editor.toolbar.highlight')}
            title={t('editor.toolbar.highlight')}
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
                <span className={styles.swatch} style={{ background: color.value }} />{' '}
                {t(HIGHLIGHT_KEYS[color.name])}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item
              className={libraryStyles.menuItem}
              onSelect={() => run().unsetHighlight().run()}
            >
              {t('editor.toolbar.removeHighlight')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <span className={styles.separator} />
      <Tool
        label={t('editor.toolbar.heading1')}
        icon={Heading1}
        active={s.h1}
        disabled={!editable}
        onClick={() => run().toggleHeading({ level: 1 }).run()}
      />
      <Tool
        label={t('editor.toolbar.heading2')}
        icon={Heading2}
        active={s.h2}
        disabled={!editable}
        onClick={() => run().toggleHeading({ level: 2 }).run()}
      />
      <Tool
        label={t('editor.toolbar.quote')}
        icon={Quote}
        active={s.quote}
        disabled={!editable}
        onClick={() => run().toggleBlockquote().run()}
      />
      <Tool
        label={t('editor.toolbar.sceneBreak')}
        icon={Minus}
        disabled={!editable}
        onClick={() => run().setHorizontalRule().run()}
      />
      <Tool
        label={t('images.toolbar.insert')}
        icon={ImagePlus}
        disabled={!editable}
        onClick={onInsertImage}
      />
      <span className={styles.separator} />
      <Tool
        label={t('editor.toolbar.alignLeft')}
        icon={AlignLeft}
        active={s.left}
        disabled={!editable}
        onClick={() => run().setTextAlign('left').run()}
      />
      <Tool
        label={t('editor.toolbar.alignCenter')}
        icon={AlignCenter}
        active={s.center}
        disabled={!editable}
        onClick={() => run().setTextAlign('center').run()}
      />
      <Tool
        label={t('editor.toolbar.alignRight')}
        icon={AlignRight}
        active={s.right}
        disabled={!editable}
        onClick={() => run().setTextAlign('right').run()}
      />
      <Tool
        label={t('editor.toolbar.justify')}
        icon={AlignJustify}
        active={s.justify}
        disabled={!editable}
        onClick={() => run().setTextAlign('justify').run()}
      />
      <span className={styles.separator} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={!editable || !s.hasSelection}>
          <button
            type="button"
            className={styles.tool}
            aria-label={t('editor.toolbar.markForeshadowing')}
            title={t('editor.toolbar.markTooltip')}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Flag size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={libraryStyles.menu} sideOffset={4}>
            {OCCURRENCE_ROLES.map((role) => (
              <DropdownMenu.Item
                key={role}
                className={libraryStyles.menuItem}
                onSelect={() => onMarkAnchor(role)}
              >
                {ROLE_GLYPHS[role]} {t(`editor.toolbar.markAs.${role}`)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Tool
        label={t(showAnchors ? 'editor.toolbar.hideAnchors' : 'editor.toolbar.showAnchors')}
        icon={showAnchors ? Eye : EyeOff}
        active={showAnchors}
        onClick={onToggleAnchors}
      />
      <span className={styles.spacer} />
      <Tool label={t('editor.toolbar.find')} icon={Search} onClick={onFind} />
      <Tool label={t('editor.toolbar.snapshots')} icon={History} onClick={onSnapshots} />
      <Tool label={t('editor.toolbar.displaySettings')} icon={Type} onClick={onDisplay} />
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useUpdateBook } from '../../api/books.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import {
  DEFAULT_DISPLAY,
  DISPLAY_FONTS,
  DISPLAY_THEMES,
  displaySettingsSchema,
  FONT_LABELS,
  type DisplaySettings,
} from '../../../shared/schemas/display.ts';

const THEME_LABELS: Record<DisplaySettings['theme'], string> = {
  light: 'Light',
  dark: 'Dark',
  sepia: 'Sepia',
};

/** Per-book editor appearance (DISP-01, DISP-02). Stored in the book settings, never in the text. */
export function DisplaySettingsDialog({
  bookId,
  display,
  onClose,
}: {
  bookId: string;
  display: DisplaySettings;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DisplaySettings>(display);
  // undefined keeps the stored image, null removes it, a File replaces it.
  const [background, setBackground] = useState<File | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateBook();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = displaySettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'These settings are not valid.');
      return;
    }
    setError(null);
    update.mutate(
      { id: bookId, patch: { display: parsed.data }, background },
      { onSuccess: onClose },
    );
  };

  const number = (
    key: 'fontSize' | 'lineHeight' | 'firstLineIndent' | 'editorWidth' | 'paragraphSpacing',
    step: number,
  ) => (
    <input
      className={uiStyles.input}
      type="number"
      step={step}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
    />
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Display settings"
      description="How the text looks while you write in this book. Only system fonts are offered."
    >
      <form onSubmit={submit}>
        <Field label="Font">
          <select
            className={uiStyles.input}
            value={draft.fontFamily}
            onChange={(e) =>
              setDraft({ ...draft, fontFamily: e.target.value as DisplaySettings['fontFamily'] })
            }
          >
            {DISPLAY_FONTS.map((font) => (
              <option key={font} value={font}>
                {FONT_LABELS[font]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Font size (px)">{number('fontSize', 1)}</Field>
        <Field label="Line height">{number('lineHeight', 0.1)}</Field>
        <Field label="First-line indent (em, 2 suits Chinese)">
          {number('firstLineIndent', 0.5)}
        </Field>
        <Field label="Editor width (px)">{number('editorWidth', 20)}</Field>
        <Field label="Theme">
          <select
            className={uiStyles.input}
            value={draft.theme}
            onChange={(e) =>
              setDraft({ ...draft, theme: e.target.value as DisplaySettings['theme'] })
            }
          >
            {DISPLAY_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Space between paragraphs (em)">{number('paragraphSpacing', 0.1)}</Field>
        <Field label="Background color">
          <span className={uiStyles.inline}>
            <input
              type="checkbox"
              checked={draft.backgroundColor !== null}
              onChange={(e) =>
                setDraft({ ...draft, backgroundColor: e.target.checked ? '#f4ecd8' : null })
              }
              aria-label="Use a custom background color"
            />
            <input
              type="color"
              value={draft.backgroundColor ?? '#ffffff'}
              disabled={draft.backgroundColor === null}
              onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })}
              aria-label="Background color"
            />
          </span>
        </Field>
        <Field label="Background image (PNG, JPEG, WebP or GIF)">
          <input
            className={uiStyles.input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setBackground(e.target.files?.[0] ?? undefined)}
            aria-label="Background image"
          />
        </Field>
        {background || (background === undefined && draft.backgroundImageAssetId) ? (
          <>
            <Field label="Background image opacity">
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={draft.backgroundImageOpacity}
                onChange={(e) =>
                  setDraft({ ...draft, backgroundImageOpacity: Number(e.target.value) })
                }
                aria-label="Background image opacity"
              />
            </Field>
            <Button onClick={() => setBackground(null)}>Remove background image</Button>
          </>
        ) : null}
        <FormError message={error ?? update.error?.message ?? null} />
        <div className={uiStyles.actions}>
          <Button
            onClick={() => {
              setDraft(DEFAULT_DISPLAY);
              setBackground(display.backgroundImageAssetId ? null : undefined);
            }}
          >
            Reset
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

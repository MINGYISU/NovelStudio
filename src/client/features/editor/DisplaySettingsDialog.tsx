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

/** Per-book editor appearance (DISP-01). Stored in the book settings, never in the text. */
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
    update.mutate({ id: bookId, patch: { display: parsed.data } }, { onSuccess: onClose });
  };

  const number = (
    key: 'fontSize' | 'lineHeight' | 'firstLineIndent' | 'editorWidth',
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
                {theme === 'light' ? 'Light' : 'Dark'}
              </option>
            ))}
          </select>
        </Field>
        <FormError message={error ?? update.error?.message ?? null} />
        <div className={uiStyles.actions}>
          <Button onClick={() => setDraft(DEFAULT_DISPLAY)}>Reset</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

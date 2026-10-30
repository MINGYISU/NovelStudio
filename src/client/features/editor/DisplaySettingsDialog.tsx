import { useState, type FormEvent } from 'react';
import { useUpdateBook } from '../../api/books.ts';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import {
  DEFAULT_DISPLAY,
  DISPLAY_FONTS,
  DISPLAY_THEMES,
  displaySettingsSchema,
  type DisplaySettings,
} from '../../../shared/schemas/display.ts';

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
  const t = useT();
  const [draft, setDraft] = useState<DisplaySettings>(display);
  // undefined keeps the stored image, null removes it, a File replaces it.
  const [background, setBackground] = useState<File | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateBook();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = displaySettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(t('editor.display.invalid'));
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
      title={t('editor.display.title')}
      description={t('editor.display.description')}
    >
      <form onSubmit={submit}>
        <Field label={t('editor.display.font')}>
          <select
            className={uiStyles.input}
            value={draft.fontFamily}
            onChange={(e) =>
              setDraft({ ...draft, fontFamily: e.target.value as DisplaySettings['fontFamily'] })
            }
          >
            {DISPLAY_FONTS.map((font) => (
              <option key={font} value={font}>
                {t(`font.${font}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('editor.display.fontSize')}>{number('fontSize', 1)}</Field>
        <Field label={t('editor.display.lineHeight')}>{number('lineHeight', 0.1)}</Field>
        <Field label={t('editor.display.firstLineIndent')}>{number('firstLineIndent', 0.5)}</Field>
        <Field label={t('editor.display.editorWidth')}>{number('editorWidth', 20)}</Field>
        <Field label={t('editor.display.theme')}>
          <select
            className={uiStyles.input}
            value={draft.theme}
            onChange={(e) =>
              setDraft({ ...draft, theme: e.target.value as DisplaySettings['theme'] })
            }
          >
            {DISPLAY_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(`theme.${theme}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('editor.display.paragraphSpacing')}>
          {number('paragraphSpacing', 0.1)}
        </Field>
        <Field label={t('editor.display.backgroundColor')}>
          <span className={uiStyles.inline}>
            <input
              type="checkbox"
              checked={draft.backgroundColor !== null}
              onChange={(e) =>
                setDraft({ ...draft, backgroundColor: e.target.checked ? '#f4ecd8' : null })
              }
              aria-label={t('editor.display.useBackgroundColor')}
            />
            <input
              type="color"
              value={draft.backgroundColor ?? '#ffffff'}
              disabled={draft.backgroundColor === null}
              onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })}
              aria-label={t('editor.display.backgroundColor')}
            />
          </span>
        </Field>
        <Field label={t('editor.display.backgroundImageField')}>
          <input
            className={uiStyles.input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setBackground(e.target.files?.[0] ?? undefined)}
            aria-label={t('editor.display.backgroundImage')}
          />
        </Field>
        {background || (background === undefined && draft.backgroundImageAssetId) ? (
          <>
            <Field label={t('editor.display.backgroundOpacity')}>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={draft.backgroundImageOpacity}
                onChange={(e) =>
                  setDraft({ ...draft, backgroundImageOpacity: Number(e.target.value) })
                }
                aria-label={t('editor.display.backgroundOpacity')}
              />
            </Field>
            <Button onClick={() => setBackground(null)}>
              {t('editor.display.removeBackground')}
            </Button>
          </>
        ) : null}
        <FormError message={error ?? (update.error ? apiErrorMessage(update.error) : null)} />
        <div className={uiStyles.actions}>
          <Button
            onClick={() => {
              setDraft(DEFAULT_DISPLAY);
              setBackground(display.backgroundImageAssetId ? null : undefined);
            }}
          >
            {t('editor.display.reset')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

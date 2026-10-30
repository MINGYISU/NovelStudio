import { useState, type FormEvent } from 'react';
import { useUpdateBook } from '../../api/books.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT, type MessageKey } from '../../i18n/index.ts';
import { formatLabel } from '../../../shared/numbering.ts';
import {
  RESTART_SCOPES,
  STRUCTURE_PRESETS,
  structureSettingsSchema,
  type KindStructure,
  type StructurePresetId,
  type StructureSettings,
} from '../../../shared/schemas/structure.ts';
import { NODE_KINDS, NODE_RANK, type NodeKind } from '../../../shared/types.ts';
import styles from './manuscript.module.css';

interface StructureDialogProps {
  bookId: string;
  structure: StructureSettings;
  onClose: () => void;
}

const PRESET_LABELS: Record<StructurePresetId, MessageKey> = {
  english: 'manuscript.structure.presetEnglish',
  chinese: 'manuscript.structure.presetChinese',
};

/** Per-book labels and number formats (NUM-01, NUM-04). Display numbers are computed, never stored. */
export function StructureDialog({ bookId, structure, onClose }: StructureDialogProps) {
  const t = useT();
  const [draft, setDraft] = useState<StructureSettings>(structure);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateBook();

  const change = (kind: NodeKind, patch: Partial<KindStructure>) =>
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = structureSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('manuscript.structure.invalid'));
      return;
    }
    setError(null);
    update.mutate({ id: bookId, patch: { structure: parsed.data } }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('manuscript.structure.title')}
      description={t('manuscript.structure.description')}
    >
      <form onSubmit={submit}>
        <div className={styles.presets}>
          <span>{t('manuscript.structure.preset')}</span>
          {(Object.keys(STRUCTURE_PRESETS) as StructurePresetId[]).map((id) => (
            <Button key={id} onClick={() => setDraft(structuredClone(STRUCTURE_PRESETS[id]))}>
              {t(PRESET_LABELS[id])}
            </Button>
          ))}
        </div>
        {NODE_KINDS.map((kind) => {
          const cfg = draft[kind];
          return (
            <fieldset key={kind} className={styles.kindFieldset}>
              <legend>{t(`kind.${kind}`)}</legend>
              <label className={styles.inline}>
                {t('manuscript.structure.label')}
                <input
                  className={uiStyles.input}
                  value={cfg.label}
                  maxLength={40}
                  onChange={(e) => change(kind, { label: e.target.value })}
                />
              </label>
              <label className={styles.inline}>
                {t('manuscript.structure.format')}
                <input
                  className={uiStyles.input}
                  value={cfg.format}
                  maxLength={80}
                  onChange={(e) => change(kind, { format: e.target.value })}
                />
              </label>
              <label className={styles.inline}>
                {t('manuscript.structure.separator')}
                <input
                  className={uiStyles.input}
                  value={cfg.separator}
                  maxLength={20}
                  onChange={(e) => change(kind, { separator: e.target.value })}
                />
              </label>
              <label className={styles.inline}>
                {t('manuscript.structure.restartWithin')}
                <select
                  className={uiStyles.input}
                  value={cfg.restartWithin}
                  onChange={(e) =>
                    change(kind, {
                      restartWithin: e.target.value as KindStructure['restartWithin'],
                    })
                  }
                >
                  {RESTART_SCOPES.filter((s) => s === 'book' || NODE_RANK[s] < NODE_RANK[kind]).map(
                    (scope) => (
                      <option key={scope} value={scope}>
                        {scope === 'book'
                          ? t('manuscript.structure.scopeBook')
                          : t(`kind.${scope}`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={cfg.defaultNumbered}
                  onChange={(e) => change(kind, { defaultNumbered: e.target.checked })}
                />
                {t('manuscript.structure.numberedByDefault')}
              </label>
              <p className={styles.preview}>
                {t('manuscript.structure.preview', {
                  text: `${formatLabel(cfg.format, 1)}${cfg.separator}${t('manuscript.structure.sampleTitle')}`,
                })}
              </p>
            </fieldset>
          );
        })}
        <FormError message={(error ?? update.error) ? apiErrorMessage(update.error) : null} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

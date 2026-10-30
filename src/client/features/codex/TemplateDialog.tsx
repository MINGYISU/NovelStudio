import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { newFieldKey } from '../../../shared/codex.ts';
import {
  CODEX_FIELD_TYPES,
  CODEX_LABEL_MAX,
  CODEX_MAX_FIELDS,
  type CodexCategory,
  type CodexFieldDef,
  type CodexFieldType,
} from '../../../shared/schemas/codex.ts';
import { useUpdateCategory } from '../../api/codex.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, type MessageKey, useT } from '../../i18n/index.ts';
import styles from './codex.module.css';

export const FIELD_TYPE_LABEL_KEYS: Record<CodexFieldType, MessageKey> = {
  text: 'codex.fieldType.text',
  longtext: 'codex.fieldType.longtext',
};

/** Moves the item at `from` by `delta` places; out-of-range moves return the list unchanged. */
export function moveItem<T>(items: readonly T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

interface TemplateDialogProps {
  bookId: string;
  category: CodexCategory;
  onClose: () => void;
}

/** CDX-04: the template is copied into new entries; existing entries are not touched. */
export function TemplateDialog({ bookId, category, onClose }: TemplateDialogProps) {
  const t = useT();
  const update = useUpdateCategory(bookId);
  const [fields, setFields] = useState<CodexFieldDef[]>(category.fieldTemplate);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CodexFieldType>('text');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const name = label.trim();
    if (!name) return;
    setFields([
      ...fields,
      { key: newFieldKey(fields, () => crypto.randomUUID()), label: name, type },
    ]);
    setLabel('');
  };

  const save = () => {
    if (fields.some((f) => f.label.trim() === '')) {
      setError(t('codex.template.nameRequired'));
      return;
    }
    update.mutate(
      {
        id: category.id,
        patch: { fieldTemplate: fields.map((f) => ({ ...f, label: f.label.trim() })) },
      },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err)) },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('codex.template.title', { name: category.name })}
      description={t('codex.template.description')}
    >
      <ul className={styles.templateList}>
        {fields.map((field, index) => (
          <li key={field.key} className={styles.templateRow}>
            <input
              className={uiStyles.input}
              aria-label={t('codex.template.fieldNameLabel', { number: index + 1 })}
              maxLength={CODEX_LABEL_MAX}
              value={field.label}
              onChange={(e) =>
                setFields(fields.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)))
              }
            />
            <select
              className={`${uiStyles.input} ${styles.typeSelect}`}
              aria-label={t('codex.template.fieldTypeLabel', { number: index + 1 })}
              value={field.type}
              onChange={(e) =>
                setFields(
                  fields.map((f, i) =>
                    i === index ? { ...f, type: e.target.value as CodexFieldType } : f,
                  ),
                )
              }
            >
              {CODEX_FIELD_TYPES.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {t(FIELD_TYPE_LABEL_KEYS[fieldType])}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t('codex.template.moveUp', { number: index + 1 })}
              disabled={index === 0}
              onClick={() => setFields(moveItem(fields, index, -1))}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t('codex.template.moveDown', { number: index + 1 })}
              disabled={index === fields.length - 1}
              onClick={() => setFields(moveItem(fields, index, 1))}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t('codex.template.remove', { number: index + 1 })}
              onClick={() => setFields(fields.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {fields.length === 0 ? (
          <li className={styles.empty}>{t('codex.template.noFields')}</li>
        ) : null}
      </ul>
      <form
        className={styles.addField}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={uiStyles.input}
          aria-label={t('codex.template.newNameLabel')}
          placeholder={t('codex.template.newNamePlaceholder')}
          maxLength={CODEX_LABEL_MAX}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <select
          className={`${uiStyles.input} ${styles.typeSelect}`}
          aria-label={t('codex.template.newTypeLabel')}
          value={type}
          onChange={(e) => setType(e.target.value as CodexFieldType)}
        >
          {CODEX_FIELD_TYPES.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {t(FIELD_TYPE_LABEL_KEYS[fieldType])}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!label.trim() || fields.length >= CODEX_MAX_FIELDS}>
          {t('codex.template.addField')}
        </Button>
      </form>
      <FormError message={error} />
      <div className={styles.dialogActions}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={update.isPending}>
          {t('codex.template.save')}
        </Button>
      </div>
    </Dialog>
  );
}

import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { MapLink } from '../../../shared/schemas/map.ts';
import {
  MAP_DESCRIPTION_MAX,
  MAP_EDGE_LABEL_MAX,
  MAP_MAX_LINKS,
  MAP_NODE_TITLE_MAX,
  MAP_STORY_TIME_MAX,
} from '../../../shared/schemas/map.ts';
import type { ResolvedLink } from '../../../shared/map-links.ts';
import { Button, Dialog, Field, uiStyles } from '../../components/ui.tsx';
import { useT, type MessageKey } from '../../i18n/index.ts';
import styles from './maps.module.css';
import type { StoryNodeData } from './StoryNode.tsx';

const PALETTE: { color: string; name: MessageKey }[] = [
  { color: '#5b4a8a', name: 'maps.color.violet' },
  { color: '#3d8b5a', name: 'maps.color.green' },
  { color: '#c0841a', name: 'maps.color.amber' },
  { color: '#b3402f', name: 'maps.color.red' },
  { color: '#2f6f9f', name: 'maps.color.blue' },
  { color: '#8a5a3c', name: 'maps.color.brown' },
  { color: '#7a7168', name: 'maps.color.gray' },
];

export interface SectionOption {
  id: string;
  label: string;
  depth: number;
}
export interface EntryOption {
  id: string;
  title: string;
  category: string;
}

interface LinkPickerProps {
  sections: SectionOption[];
  entries: EntryOption[];
  existing: MapLink[];
  onPick: (link: MapLink) => void;
  onClose: () => void;
}

function LinkPicker({ sections, entries, existing, onPick, onClose }: LinkPickerProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const has = (type: MapLink['type'], id: string) =>
    existing.some((l) => l.type === type && l.id === id);
  const shownSections = sections.filter((s) => s.label.toLowerCase().includes(q));
  const shownEntries = entries.filter((e) => e.title.toLowerCase().includes(q));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('maps.picker.title')}>
      <input
        className={uiStyles.input}
        style={{ width: '100%' }}
        placeholder={t('maps.picker.filterPlaceholder')}
        aria-label={t('maps.picker.filter')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className={styles.pickerLists}>
        <h3 className={styles.pickerHeading}>{t('maps.picker.sections')}</h3>
        {shownSections.length === 0 ? (
          <p className={styles.muted}>{t('maps.picker.noSections')}</p>
        ) : null}
        {shownSections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.pickerItem}
            style={{ paddingLeft: `${0.5 + s.depth}rem` }}
            disabled={has('node', s.id)}
            onClick={() => onPick({ type: 'node', id: s.id })}
          >
            {s.label}
          </button>
        ))}
        <h3 className={styles.pickerHeading}>{t('maps.picker.entries')}</h3>
        {shownEntries.length === 0 ? (
          <p className={styles.muted}>{t('maps.picker.noEntries')}</p>
        ) : null}
        {shownEntries.map((e) => (
          <button
            key={e.id}
            type="button"
            className={styles.pickerItem}
            disabled={has('codex', e.id)}
            onClick={() => onPick({ type: 'codex', id: e.id })}
          >
            {e.title || t('common.untitled')} <span className={styles.muted}>· {e.category}</span>
          </button>
        ))}
      </div>
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>{t('common.done')}</Button>
      </div>
    </Dialog>
  );
}

interface NodeInspectorProps {
  data: StoryNodeData;
  readOnly: boolean;
  autoFocusTitle: boolean;
  sections: SectionOption[];
  entries: EntryOption[];
  resolveLink: (link: MapLink) => ResolvedLink;
  openLink: (link: MapLink) => void;
  onChange: (patch: Partial<StoryNodeData>) => void;
  onDelete: () => void;
}

/** MAP-03: edit the selected node's title, story time, description, color and links. */
export function NodeInspector(props: NodeInspectorProps) {
  const { data, readOnly, resolveLink, openLink, onChange } = props;
  const t = useT();
  const [picking, setPicking] = useState(false);

  return (
    <aside className={styles.inspector} aria-label={t('maps.inspector.nodeLabel')}>
      <h2 className={styles.inspectorTitle}>{t('maps.inspector.node')}</h2>
      <Field label={t('maps.inspector.title')}>
        <input
          className={uiStyles.input}
          value={data.title}
          maxLength={MAP_NODE_TITLE_MAX}
          disabled={readOnly}
          autoFocus={props.autoFocusTitle}
          onFocus={(e) => props.autoFocusTitle && e.currentTarget.select()}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field label={t('maps.inspector.storyTime')}>
        <input
          className={uiStyles.input}
          value={data.storyTime}
          maxLength={MAP_STORY_TIME_MAX}
          placeholder={t('maps.inspector.storyTimePlaceholder')}
          disabled={readOnly}
          onChange={(e) => onChange({ storyTime: e.target.value })}
        />
      </Field>
      <Field label={t('maps.inspector.description')}>
        <textarea
          className={uiStyles.input}
          rows={5}
          value={data.description}
          maxLength={MAP_DESCRIPTION_MAX}
          disabled={readOnly}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('maps.inspector.color')}</span>
        <div className={styles.swatches}>
          {PALETTE.map(({ color, name }) => (
            <button
              key={color}
              type="button"
              className={`${styles.swatch} ${data.color.toLowerCase() === color ? styles.swatchOn : ''}`}
              style={{ background: color }}
              aria-label={t('maps.inspector.colorOption', { name: t(name) })}
              disabled={readOnly}
              onClick={() => onChange({ color })}
            />
          ))}
          <input
            type="color"
            aria-label={t('maps.inspector.customColor')}
            value={data.color}
            disabled={readOnly}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('maps.inspector.links')}</span>
        {data.links.length === 0 ? (
          <p className={styles.muted}>{t('maps.inspector.noLinks')}</p>
        ) : null}
        {data.links.map((link) => {
          const resolved = resolveLink(link);
          return (
            <div key={`${link.type}:${link.id}`} className={styles.linkRow}>
              <button
                type="button"
                className={`${styles.linkOpen} ${resolved.state !== 'ok' ? styles.chipMuted : ''}`}
                disabled={resolved.state !== 'ok'}
                onClick={() => openLink(link)}
              >
                {t(
                  link.type === 'node' ? 'maps.inspector.linkSection' : 'maps.inspector.linkEntry',
                  {
                    label: resolved.label,
                  },
                )}
              </button>
              {readOnly ? null : (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t('maps.inspector.removeLink', { label: resolved.label })}
                  onClick={() =>
                    onChange({
                      links: data.links.filter((l) => !(l.type === link.type && l.id === link.id)),
                    })
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
        {readOnly ? null : (
          <Button disabled={data.links.length >= MAP_MAX_LINKS} onClick={() => setPicking(true)}>
            {t('maps.inspector.addLink')}
          </Button>
        )}
      </div>
      {readOnly ? null : (
        <Button variant="danger" onClick={props.onDelete}>
          <Trash2 size={14} /> {t('maps.inspector.deleteNode')}
        </Button>
      )}
      {picking ? (
        <LinkPicker
          sections={props.sections}
          entries={props.entries}
          existing={data.links}
          onPick={(link) => onChange({ links: [...data.links, link] })}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </aside>
  );
}

interface EdgeInspectorProps {
  label: string;
  from: string;
  to: string;
  readOnly: boolean;
  onLabel: (label: string) => void;
  onDelete: () => void;
}

/** MAP-04: an edge's optional label. */
export function EdgeInspector({
  label,
  from,
  to,
  readOnly,
  onLabel,
  onDelete,
}: EdgeInspectorProps) {
  const t = useT();
  return (
    <aside className={styles.inspector} aria-label={t('maps.inspector.edgeLabel')}>
      <h2 className={styles.inspectorTitle}>{t('maps.inspector.edge')}</h2>
      <p className={styles.muted}>
        {from || t('common.untitled')} → {to || t('common.untitled')}
      </p>
      <Field label={t('maps.inspector.label')}>
        <input
          className={uiStyles.input}
          value={label}
          maxLength={MAP_EDGE_LABEL_MAX}
          disabled={readOnly}
          onChange={(e) => onLabel(e.target.value)}
        />
      </Field>
      {readOnly ? null : (
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={14} /> {t('maps.inspector.deleteEdge')}
        </Button>
      )}
    </aside>
  );
}

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
import styles from './maps.module.css';
import type { StoryNodeData } from './StoryNode.tsx';

const PALETTE = ['#5b4a8a', '#3d8b5a', '#c0841a', '#b3402f', '#2f6f9f', '#8a5a3c', '#7a7168'];

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
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const has = (type: MapLink['type'], id: string) =>
    existing.some((l) => l.type === type && l.id === id);
  const shownSections = sections.filter((s) => s.label.toLowerCase().includes(q));
  const shownEntries = entries.filter((e) => e.title.toLowerCase().includes(q));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Link to…">
      <input
        className={uiStyles.input}
        style={{ width: '100%' }}
        placeholder="Filter sections and codex entries"
        aria-label="Filter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className={styles.pickerLists}>
        <h3 className={styles.pickerHeading}>Sections</h3>
        {shownSections.length === 0 ? <p className={styles.muted}>No matching sections.</p> : null}
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
        <h3 className={styles.pickerHeading}>Codex entries</h3>
        {shownEntries.length === 0 ? (
          <p className={styles.muted}>No matching codex entries.</p>
        ) : null}
        {shownEntries.map((e) => (
          <button
            key={e.id}
            type="button"
            className={styles.pickerItem}
            disabled={has('codex', e.id)}
            onClick={() => onPick({ type: 'codex', id: e.id })}
          >
            {e.title || '(untitled)'} <span className={styles.muted}>· {e.category}</span>
          </button>
        ))}
      </div>
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>Done</Button>
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
  const [picking, setPicking] = useState(false);

  return (
    <aside className={styles.inspector} aria-label="Node details">
      <h2 className={styles.inspectorTitle}>Node</h2>
      <Field label="Title">
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
      <Field label="Story time">
        <input
          className={uiStyles.input}
          value={data.storyTime}
          maxLength={MAP_STORY_TIME_MAX}
          placeholder="e.g. Spring 1923"
          disabled={readOnly}
          onChange={(e) => onChange({ storyTime: e.target.value })}
        />
      </Field>
      <Field label="Description">
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
        <span className={styles.fieldLabel}>Color</span>
        <div className={styles.swatches}>
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={`${styles.swatch} ${data.color.toLowerCase() === color ? styles.swatchOn : ''}`}
              style={{ background: color }}
              aria-label={`Color ${color}`}
              disabled={readOnly}
              onClick={() => onChange({ color })}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={data.color}
            disabled={readOnly}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Links</span>
        {data.links.length === 0 ? <p className={styles.muted}>No links.</p> : null}
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
                {link.type === 'node' ? 'Section' : 'Codex'}: {resolved.label}
              </button>
              {readOnly ? null : (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove link ${resolved.label}`}
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
            Add link…
          </Button>
        )}
      </div>
      {readOnly ? null : (
        <Button variant="danger" onClick={props.onDelete}>
          <Trash2 size={14} /> Delete node
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
  return (
    <aside className={styles.inspector} aria-label="Edge details">
      <h2 className={styles.inspectorTitle}>Edge</h2>
      <p className={styles.muted}>
        {from || 'Untitled'} → {to || 'Untitled'}
      </p>
      <Field label="Label">
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
          <Trash2 size={14} /> Delete edge
        </Button>
      )}
    </aside>
  );
}

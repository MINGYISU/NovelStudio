import { layoutMap } from './map-layout.ts';
import { DEFAULT_LOCALE, type Locale } from './schemas/locale.ts';
import { mapNodeText } from './seed-text.ts';
import {
  DEFAULT_NODE_COLOR,
  emptyMapData,
  type MapData,
  type MapDirection,
  type MapTemplate,
} from './schemas/map.ts';

interface TemplateNode {
  key: string;
  color?: string;
}

interface TemplateDef {
  direction: MapDirection;
  nodes: TemplateNode[];
  edges: [from: string, to: string, label?: string][];
}

const GREEN = '#3d8b5a';
const AMBER = '#c0841a';
const RED = '#b3402f';

const DEFINITIONS: Record<Exclude<MapTemplate, 'blank'>, TemplateDef> = {
  timeline: {
    direction: 'LR',
    nodes: [{ key: 'a' }, { key: 'b' }, { key: 'c', color: AMBER }, { key: 'd' }],
    edges: [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ],
  },
  'plot-tree': {
    direction: 'TB',
    nodes: [
      { key: 'premise' },
      { key: 'setup', color: GREEN },
      { key: 'incident', color: GREEN },
      { key: 'confrontation', color: AMBER },
      { key: 'midpoint', color: AMBER },
      { key: 'crisis', color: AMBER },
      { key: 'resolution', color: RED },
      { key: 'climax', color: RED },
    ],
    edges: [
      ['premise', 'setup'],
      ['premise', 'confrontation'],
      ['premise', 'resolution'],
      ['setup', 'incident'],
      ['confrontation', 'midpoint'],
      ['confrontation', 'crisis'],
      ['resolution', 'climax'],
    ],
  },
  'character-arc': {
    direction: 'LR',
    nodes: [
      { key: 'start' },
      { key: 'first', color: AMBER },
      { key: 'second', color: AMBER },
      { key: 'end', color: GREEN },
    ],
    edges: [
      ['start', 'first'],
      ['first', 'second'],
      ['second', 'end'],
    ],
  },
};

/** A new map's starting content (MAP-02). Templates are only starting layouts; nothing refers back to them. */
export function buildTemplate(
  template: MapTemplate,
  newId: () => string,
  locale: Locale = DEFAULT_LOCALE,
): MapData {
  if (template === 'blank') return emptyMapData();
  const def = DEFINITIONS[template];
  const ids = new Map(def.nodes.map((n) => [n.key, newId()]));
  const data: MapData = {
    nodes: def.nodes.map((n) => {
      const text = mapNodeText(template, n.key, locale);
      return {
        id: ids.get(n.key) as string,
        position: { x: 0, y: 0 },
        data: {
          title: text.title,
          description: text.description,
          color: n.color ?? DEFAULT_NODE_COLOR,
          storyTime: '',
          links: [],
        },
      };
    }),
    edges: def.edges.map(([from, to, label]) => ({
      id: newId(),
      source: ids.get(from) as string,
      target: ids.get(to) as string,
      label: label ?? '',
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutDirection: def.direction,
  };
  return layoutMap(data, def.direction);
}

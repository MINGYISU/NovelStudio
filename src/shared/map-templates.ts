import { layoutMap } from './map-layout.ts';
import {
  DEFAULT_NODE_COLOR,
  emptyMapData,
  type MapData,
  type MapDirection,
  type MapTemplate,
} from './schemas/map.ts';

interface TemplateNode {
  key: string;
  title: string;
  description?: string;
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
    nodes: [
      { key: 'a', title: 'Opening' },
      { key: 'b', title: 'Development' },
      { key: 'c', title: 'Turning point', color: AMBER },
      { key: 'd', title: 'Ending' },
    ],
    edges: [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ],
  },
  'plot-tree': {
    direction: 'TB',
    nodes: [
      { key: 'premise', title: 'Premise' },
      { key: 'setup', title: 'Setup', color: GREEN },
      { key: 'incident', title: 'Inciting incident', color: GREEN },
      { key: 'confrontation', title: 'Confrontation', color: AMBER },
      { key: 'midpoint', title: 'Midpoint', color: AMBER },
      { key: 'crisis', title: 'Crisis', color: AMBER },
      { key: 'resolution', title: 'Resolution', color: RED },
      { key: 'climax', title: 'Climax', color: RED },
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
      { key: 'start', title: 'Start state', description: 'Who they are at the beginning.' },
      { key: 'first', title: 'First change', color: AMBER },
      { key: 'second', title: 'Second change', color: AMBER },
      { key: 'end', title: 'End state', description: 'Who they have become.', color: GREEN },
    ],
    edges: [
      ['start', 'first'],
      ['first', 'second'],
      ['second', 'end'],
    ],
  },
};

/** A new map's starting content (MAP-02). Templates are only starting layouts; nothing refers back to them. */
export function buildTemplate(template: MapTemplate, newId: () => string): MapData {
  if (template === 'blank') return emptyMapData();
  const def = DEFINITIONS[template];
  const ids = new Map(def.nodes.map((n) => [n.key, newId()]));
  const data: MapData = {
    nodes: def.nodes.map((n) => ({
      id: ids.get(n.key) as string,
      position: { x: 0, y: 0 },
      data: {
        title: n.title,
        description: n.description ?? '',
        color: n.color ?? DEFAULT_NODE_COLOR,
        storyTime: '',
        links: [],
      },
    })),
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

import { describe, expect, it } from 'vitest';
import { layoutMap, NODE_HEIGHT, NODE_WIDTH } from './map-layout.ts';
import { buildTemplate } from './map-templates.ts';
import {
  emptyMapData,
  mapDataSchema,
  MAP_TEMPLATES,
  type MapData,
  type MapNode,
} from './schemas/map.ts';

let counter = 0;
const newId = () => `id-${++counter}`;

function node(id: string, x = 0, y = 0): MapNode {
  return {
    id,
    position: { x, y },
    data: { title: id, description: '', color: '#112233', storyTime: '', links: [] },
  };
}

function graph(ids: string[], edges: [string, string][]): MapData {
  return {
    ...emptyMapData(),
    nodes: ids.map((id) => node(id)),
    edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target, label: '' })),
  };
}

const at = (data: MapData, id: string) => data.nodes.find((n) => n.id === id)!.position;

function overlaps(data: MapData): boolean {
  const boxes = data.nodes.map((n) => n.position);
  return boxes.some((a, i) =>
    boxes.some(
      (b, j) => i < j && Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT,
    ),
  );
}

describe('layoutMap (MAP-06)', () => {
  it('puts children below their parent for TB and to the right for LR', () => {
    const data = graph(
      ['root', 'a', 'b'],
      [
        ['root', 'a'],
        ['root', 'b'],
      ],
    );
    const tb = layoutMap(data, 'TB');
    expect(tb.layoutDirection).toBe('TB');
    expect(at(tb, 'a').y).toBeGreaterThan(at(tb, 'root').y);
    expect(at(tb, 'a').y).toBe(at(tb, 'b').y);
    expect(at(tb, 'a').x).not.toBe(at(tb, 'b').x);

    const lr = layoutMap(data, 'LR');
    expect(lr.layoutDirection).toBe('LR');
    expect(at(lr, 'a').x).toBeGreaterThan(at(lr, 'root').x);
    expect(at(lr, 'a').x).toBe(at(lr, 'b').x);
  });

  it('keeps siblings in the order their edges were made', () => {
    const data = graph(
      ['root', 'a', 'b', 'c'],
      [
        ['root', 'a'],
        ['root', 'b'],
        ['root', 'c'],
      ],
    );
    const tb = layoutMap(data, 'TB');
    expect([at(tb, 'a').x, at(tb, 'b').x, at(tb, 'c').x]).toEqual(
      [at(tb, 'a').x, at(tb, 'b').x, at(tb, 'c').x].sort((x, y) => x - y),
    );
    expect(at(tb, 'a').x).toBeLessThan(at(tb, 'c').x);
    const lr = layoutMap(data, 'LR');
    expect(at(lr, 'a').y).toBeLessThan(at(lr, 'b').y);
    expect(at(lr, 'b').y).toBeLessThan(at(lr, 'c').y);
  });

  it('never overlaps nodes, also for disconnected parts', () => {
    const data = graph(
      ['a', 'b', 'c', 'd', 'e', 'lonely'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['c', 'd'],
        ['c', 'e'],
      ],
    );
    expect(overlaps(layoutMap(data, 'TB'))).toBe(false);
    expect(overlaps(layoutMap(data, 'LR'))).toBe(false);
  });

  it('copes with cycles, self-loops and an empty map', () => {
    const cyclic = graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
        ['b', 'b'],
      ],
    );
    const laid = layoutMap(cyclic, 'TB');
    expect(laid.nodes).toHaveLength(3);
    expect(overlaps(laid)).toBe(false);
    expect(layoutMap(emptyMapData(), 'LR')).toMatchObject({ nodes: [], layoutDirection: 'LR' });
  });

  it('changes nothing but positions and the direction, and does not mutate its input', () => {
    const data = graph(['a', 'b'], [['a', 'b']]);
    data.nodes[0]!.data.title = 'Kept';
    const before = JSON.stringify(data);
    const laid = layoutMap(data, 'LR');
    expect(JSON.stringify(data)).toBe(before);
    expect(laid.edges).toEqual(data.edges);
    expect(laid.nodes[0]!.data).toEqual(data.nodes[0]!.data);
    expect(laid.viewport).toEqual(data.viewport);
  });

  it('uses measured sizes when given', () => {
    const data = graph(['a', 'b'], [['a', 'b']]);
    const sizes = new Map([
      ['a', { width: 220, height: 400 }],
      ['b', { width: 220, height: 96 }],
    ]);
    const gap = (d: MapData) => at(d, 'b').y - at(d, 'a').y;
    expect(gap(layoutMap(data, 'TB', sizes))).toBeGreaterThan(gap(layoutMap(data, 'TB')));
  });
});

describe('templates (MAP-02)', () => {
  it.each(MAP_TEMPLATES)('"%s" produces valid map data', (template) => {
    const data = buildTemplate(template, newId);
    expect(mapDataSchema.safeParse(data).success).toBe(true);
    expect(overlaps(data)).toBe(false);
  });

  it('blank is empty and top-down', () => {
    expect(buildTemplate('blank', newId)).toEqual(emptyMapData());
  });

  it('timeline is a left-to-right chain, plot tree is top-down, character arc starts and ends', () => {
    const timeline = buildTemplate('timeline', newId);
    expect(timeline.layoutDirection).toBe('LR');
    expect(timeline.edges).toHaveLength(timeline.nodes.length - 1);
    const xs = timeline.nodes.map((n) => n.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));

    const tree = buildTemplate('plot-tree', newId);
    expect(tree.layoutDirection).toBe('TB');
    const root = tree.nodes[0]!;
    expect(tree.nodes.every((n) => n.position.y >= root.position.y)).toBe(true);

    const arc = buildTemplate('character-arc', newId);
    expect(arc.layoutDirection).toBe('LR');
    expect(arc.nodes[0]!.data.title).toBe('Start state');
    expect(arc.nodes.at(-1)!.data.title).toBe('End state');
  });

  it('gives every node and edge its own id', () => {
    const data = buildTemplate('plot-tree', newId);
    const ids = [...data.nodes.map((n) => n.id), ...data.edges.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

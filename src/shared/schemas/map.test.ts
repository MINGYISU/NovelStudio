import { describe, expect, it } from 'vitest';
import {
  createMapBodySchema,
  emptyMapData,
  mapDataSchema,
  readMapData,
  repairMapData,
  type MapData,
} from './map.ts';

const LINK_ID = '00000000-0000-4000-8000-00000000000a';

const goodNode = (id: string, title = id) => ({
  id,
  position: { x: 10, y: 20 },
  data: { title, description: 'd', color: '#aabbcc', storyTime: 'Spring', links: [] },
});

const good = (): MapData => ({
  nodes: [goodNode('a'), goodNode('b')],
  edges: [{ id: 'e1', source: 'a', target: 'b', label: 'then' }],
  viewport: { x: 1, y: 2, zoom: 1.5 },
  layoutDirection: 'LR',
});

describe('mapDataSchema', () => {
  it('accepts valid data and the empty map', () => {
    expect(mapDataSchema.safeParse(good()).success).toBe(true);
    expect(mapDataSchema.safeParse(emptyMapData()).success).toBe(true);
  });

  it('rejects bad colors, edges to missing nodes, duplicate ids and over-long text', () => {
    const bad = (change: (d: MapData) => void) => {
      const d = good();
      change(d);
      return mapDataSchema.safeParse(d).success;
    };
    expect(bad((d) => (d.nodes[0]!.data.color = 'red'))).toBe(false);
    expect(bad((d) => (d.edges[0]!.target = 'zzz'))).toBe(false);
    expect(bad((d) => (d.nodes[1]!.id = 'a'))).toBe(false);
    expect(bad((d) => d.edges.push({ ...d.edges[0]! }))).toBe(false);
    expect(bad((d) => (d.nodes[0]!.data.description = 'x'.repeat(5001)))).toBe(false);
    expect(bad((d) => (d.viewport.zoom = Number.NaN))).toBe(false);
    expect(bad((d) => (d.nodes[0]!.data.links = [{ type: 'node', id: 'not-a-uuid' }]))).toBe(false);
    expect(bad((d) => (d.layoutDirection = 'RL' as 'TB'))).toBe(false);
  });
});

describe('createMapBodySchema', () => {
  it('needs a known template and trims the title', () => {
    expect(createMapBodySchema.parse({ template: 'timeline', title: '  Arc ' }).title).toBe('Arc');
    expect(createMapBodySchema.safeParse({ template: 'nope' }).success).toBe(false);
    expect(createMapBodySchema.safeParse({ template: 'blank', title: '  ' }).success).toBe(false);
  });
});

describe('repairMapData', () => {
  it('returns valid data unchanged with no problems', () => {
    expect(repairMapData(good())).toEqual({ data: good(), problems: [] });
  });

  it('leaves out a damaged node with its edges, and says so', () => {
    const raw = good() as unknown as { nodes: Record<string, unknown>[] };
    raw.nodes[1] = { id: 'b', position: 'nowhere' };
    const { data, problems } = repairMapData(raw);
    expect(data.nodes.map((n) => n.id)).toEqual(['a']);
    expect(data.edges).toEqual([]);
    expect(problems.join(' ')).toContain('could not be read');
    expect(problems.join(' ')).toContain('joins a node that is not in the map');
  });

  it('drops only the unreadable link of a node and keeps the node', () => {
    const raw = good();
    (raw.nodes[0]!.data.links as unknown[]) = [
      { type: 'node', id: LINK_ID },
      { type: 'node', id: 'bad' },
    ];
    const { data, problems } = repairMapData(raw);
    expect(data.nodes[0]!.data.links).toEqual([{ type: 'node', id: LINK_ID }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('unreadable link');
  });

  it('drops a repeated node id and a repeated edge id', () => {
    const raw = good();
    raw.nodes.push(goodNode('a', 'again'));
    raw.edges.push({ ...raw.edges[0]! });
    const { data, problems } = repairMapData(raw);
    expect(data.nodes).toHaveLength(2);
    expect(data.edges).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });

  it('falls back to default view settings without calling it damage', () => {
    const { data, problems } = repairMapData({ ...good(), viewport: 'x', layoutDirection: 'up' });
    expect(data.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(data.layoutDirection).toBe('TB');
    expect(problems).toEqual([]);
  });

  it('treats anything that is not an object, and broken JSON, as unreadable', () => {
    for (const raw of [null, 'text', 5, [1]]) {
      const result = repairMapData(raw);
      expect(result.data).toEqual(emptyMapData());
      expect(result.problems).toHaveLength(1);
    }
    expect(readMapData('{not json').problems).toHaveLength(1);
    expect(readMapData(JSON.stringify(good()))).toEqual({ data: good(), problems: [] });
  });
});

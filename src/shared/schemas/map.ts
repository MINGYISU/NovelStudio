import { z } from 'zod';
import { localeSchema } from './locale.ts';

export const MAP_TEMPLATES = ['blank', 'timeline', 'plot-tree', 'character-arc'] as const;
export type MapTemplate = (typeof MAP_TEMPLATES)[number];

export const MAP_TITLE_MAX = 200;
export const MAP_NODE_TITLE_MAX = 200;
export const MAP_DESCRIPTION_MAX = 5000;
export const MAP_STORY_TIME_MAX = 100;
export const MAP_EDGE_LABEL_MAX = 200;
export const MAP_MAX_NODES = 500;
export const MAP_MAX_EDGES = 1000;
export const MAP_MAX_LINKS = 50;
const COORDINATE_LIMIT = 1_000_000;

export const DEFAULT_NODE_COLOR = '#5b4a8a';

const localId = z.string().min(1).max(64);
const coordinate = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT);

export const mapLinkSchema = z.object({
  type: z.enum(['node', 'codex']),
  id: z.uuid(),
});
export type MapLink = z.infer<typeof mapLinkSchema>;

export const mapNodeSchema = z.object({
  id: localId,
  position: z.object({ x: coordinate, y: coordinate }),
  data: z.object({
    title: z.string().max(MAP_NODE_TITLE_MAX),
    description: z.string().max(MAP_DESCRIPTION_MAX),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    storyTime: z.string().max(MAP_STORY_TIME_MAX),
    links: z.array(mapLinkSchema).max(MAP_MAX_LINKS),
  }),
});
export type MapNode = z.infer<typeof mapNodeSchema>;

export const mapEdgeSchema = z.object({
  id: localId,
  source: localId,
  target: localId,
  label: z.string().max(MAP_EDGE_LABEL_MAX),
});
export type MapEdge = z.infer<typeof mapEdgeSchema>;

export const mapViewportSchema = z.object({
  x: coordinate,
  y: coordinate,
  zoom: z.number().min(0.01).max(10),
});

export const MAP_DIRECTIONS = ['TB', 'LR'] as const;
export type MapDirection = (typeof MAP_DIRECTIONS)[number];

const mapDataShape = z.object({
  nodes: z.array(mapNodeSchema).max(MAP_MAX_NODES),
  edges: z.array(mapEdgeSchema).max(MAP_MAX_EDGES),
  viewport: mapViewportSchema,
  layoutDirection: z.enum(MAP_DIRECTIONS),
});

function hasValidReferences(data: z.infer<typeof mapDataShape>): boolean {
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  if (nodeIds.size !== data.nodes.length) return false;
  const edgeIds = new Set(data.edges.map((e) => e.id));
  if (edgeIds.size !== data.edges.length) return false;
  return data.edges.every((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
}

/** Request/stored shape (ARCHITECTURE §9): unique ids and edges that only join existing nodes. */
export const mapDataSchema = mapDataShape.refine(hasValidReferences, {
  message: 'Node and edge ids must be unique and every edge must join two existing nodes.',
});
export type MapData = z.infer<typeof mapDataSchema>;

export const EMPTY_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const;

export function emptyMapData(): MapData {
  return { nodes: [], edges: [], viewport: { ...EMPTY_VIEWPORT }, layoutDirection: 'TB' };
}

export interface RepairedMapData {
  data: MapData;
  /** What was unreadable and left out. Empty when the stored data was fully valid. */
  problems: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const DATA_KEYS = ['nodes', 'edges', 'viewport', 'layoutDirection'];
const NODE_KEYS = ['id', 'position', 'data'];
const NODE_DATA_KEYS = ['title', 'description', 'color', 'storyTime', 'links'];
const EDGE_KEYS = ['id', 'source', 'target', 'label'];
const LINK_KEYS = ['type', 'id'];

function unknownKeys(value: unknown, known: readonly string[]): string[] {
  const record = asRecord(value);
  return record ? Object.keys(record).filter((k) => !known.includes(k)) : [];
}

/**
 * Reads untrusted map data item by item, so one damaged node, edge or link never hides the rest
 * (used when reading a stored map and when restoring a backup). Nothing is dropped without being
 * listed in `problems`, including keys this version does not know (MAP-08): saving would lose them,
 * so a stored map with such keys counts as damaged.
 */
export function repairMapData(raw: unknown): RepairedMapData {
  const problems: string[] = [];
  const record = asRecord(raw);
  if (!record) {
    return { data: emptyMapData(), problems: ['The map data could not be read.'] };
  }
  const unknown = (where: string, keys: string[]) => {
    if (keys.length > 0) {
      problems.push(`${where} has data this version does not know: ${keys.join(', ')}.`);
    }
  };
  unknown('The map', unknownKeys(record, DATA_KEYS));

  const nodes: MapNode[] = [];
  const nodeIds = new Set<string>();
  const rawNodes = Array.isArray(record['nodes']) ? record['nodes'] : [];
  if (!Array.isArray(record['nodes'])) problems.push('The list of nodes could not be read.');
  for (const item of rawNodes) {
    const title = asRecord(asRecord(item)?.['data'])?.['title'];
    const label = typeof title === 'string' && title ? `"${title}"` : 'A node';
    const data = asRecord(asRecord(item)?.['data']);
    unknown(label, [
      ...unknownKeys(item, NODE_KEYS),
      ...unknownKeys(data, NODE_DATA_KEYS).map((k) => `data.${k}`),
      ...(Array.isArray(data?.['links'])
        ? data['links'].flatMap((l: unknown) => unknownKeys(l, LINK_KEYS).map((k) => `links.${k}`))
        : []),
    ]);
    let candidate: unknown = item;
    if (data && Array.isArray(data['links'])) {
      const links = data['links'].filter((l) => mapLinkSchema.safeParse(l).success);
      if (links.length !== data['links'].length) {
        problems.push(`${label} had ${data['links'].length - links.length} unreadable link(s).`);
      }
      candidate = { ...(item as object), data: { ...data, links } };
    }
    const parsed = mapNodeSchema.safeParse(candidate);
    if (!parsed.success) {
      problems.push(`${label} could not be read and was left out.`);
    } else if (nodeIds.has(parsed.data.id)) {
      problems.push(`${label} repeats the id of another node and was left out.`);
    } else if (nodes.length >= MAP_MAX_NODES) {
      problems.push(`${label} is beyond the limit of ${MAP_MAX_NODES} nodes and was left out.`);
    } else {
      nodeIds.add(parsed.data.id);
      nodes.push(parsed.data);
    }
  }

  const edges: MapEdge[] = [];
  const edgeIds = new Set<string>();
  const rawEdges = Array.isArray(record['edges']) ? record['edges'] : [];
  if (!Array.isArray(record['edges'])) problems.push('The list of edges could not be read.');
  for (const item of rawEdges) {
    unknown('An edge', unknownKeys(item, EDGE_KEYS));
    const parsed = mapEdgeSchema.safeParse(item);
    if (!parsed.success) {
      problems.push('An edge could not be read and was left out.');
    } else if (edgeIds.has(parsed.data.id)) {
      problems.push('An edge repeats the id of another edge and was left out.');
    } else if (!nodeIds.has(parsed.data.source) || !nodeIds.has(parsed.data.target)) {
      problems.push('An edge joins a node that is not in the map and was left out.');
    } else if (edges.length >= MAP_MAX_EDGES) {
      problems.push(`An edge is beyond the limit of ${MAP_MAX_EDGES} edges and was left out.`);
    } else {
      edgeIds.add(parsed.data.id);
      edges.push(parsed.data);
    }
  }

  // The view settings are only convenience, so falling back to defaults loses nothing.
  const viewport = mapViewportSchema.safeParse(record['viewport']);
  const direction = z.enum(MAP_DIRECTIONS).safeParse(record['layoutDirection']);
  return {
    data: {
      nodes,
      edges,
      viewport: viewport.success ? viewport.data : { ...EMPTY_VIEWPORT },
      layoutDirection: direction.success ? direction.data : 'TB',
    },
    problems,
  };
}

/** Parses a stored JSON column; invalid JSON counts as unreadable data. */
export function readMapData(json: string): RepairedMapData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = null;
  }
  return repairMapData(raw);
}

const mapTitle = z.string().trim().min(1).max(MAP_TITLE_MAX);

export const storyMapSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  title: z.string(),
  template: z.string(),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  data: mapDataSchema,
  /** True when stored data was partly unreadable; the client then keeps the map read-only. */
  damaged: z.boolean(),
});
export type StoryMap = z.infer<typeof storyMapSchema>;

export const mapsResponseSchema = z.object({ maps: z.array(storyMapSchema) });
export const mapResponseSchema = z.object({ map: storyMapSchema });
export const mapSavedResponseSchema = z.object({ updatedAt: z.string() });

export const createMapBodySchema = z.object({
  title: mapTitle.optional(),
  template: z.enum(MAP_TEMPLATES),
  locale: localeSchema.optional(),
});
export type CreateMapBody = z.infer<typeof createMapBodySchema>;

export const patchMapBodySchema = z.object({ title: mapTitle });
export type PatchMapBody = z.infer<typeof patchMapBodySchema>;

export const putMapDataBodySchema = z.object({ data: mapDataSchema });

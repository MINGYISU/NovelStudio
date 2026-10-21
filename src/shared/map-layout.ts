import dagre from '@dagrejs/dagre';
import type { MapData, MapDirection } from './schemas/map.ts';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;

export interface NodeSize {
  width: number;
  height: number;
}

/**
 * Arranges the graph as a tree/flow (MAP-06). Only positions and `layoutDirection` change.
 * `sizes` are the measured node sizes when the canvas knows them; others use the default size.
 */
export function layoutMap(
  data: MapData,
  direction: MapDirection,
  sizes?: ReadonlyMap<string, NodeSize>,
): MapData {
  if (data.nodes.length === 0) return { ...data, layoutDirection: direction };

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70 });
  graph.setDefaultEdgeLabel(() => ({}));
  const sizeOf = (id: string): NodeSize =>
    sizes?.get(id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
  for (const node of data.nodes) graph.setNode(node.id, sizeOf(node.id));
  // dagre lays siblings out in reverse insertion order; reversing keeps them in the order they were made.
  for (const edge of [...data.edges].reverse()) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  return {
    ...data,
    layoutDirection: direction,
    nodes: data.nodes.map((node) => {
      const placed = graph.node(node.id);
      const { width, height } = sizeOf(node.id);
      // dagre returns centres; the canvas positions nodes by their top-left corner.
      return {
        ...node,
        position: { x: Math.round(placed.x - width / 2), y: Math.round(placed.y - height / 2) },
      };
    }),
  };
}

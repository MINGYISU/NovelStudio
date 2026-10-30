import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, Plus, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutMap, NODE_HEIGHT, NODE_WIDTH } from '../../../shared/map-layout.ts';
import { resolveMapLink, type LinkTarget, type LinkTexts } from '../../../shared/map-links.ts';
import {
  DEFAULT_NODE_COLOR,
  EMPTY_VIEWPORT,
  MAP_MAX_EDGES,
  MAP_MAX_NODES,
  type MapData,
  type MapDirection,
  type MapLink,
  type StoryMap,
} from '../../../shared/schemas/map.ts';
import { cacheMapData, putMapData } from '../../api/maps.ts';
import { apiErrorMessage, t as translateNow, useT, type MessageKey } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { MapCanvasContext, type MapCanvasContextValue } from './map-context.ts';
import { MapSaver, trackMapSaver, type MapSaveState } from './map-saver.ts';
import styles from './maps.module.css';
import {
  EdgeInspector,
  NodeInspector,
  type EntryOption,
  type SectionOption,
} from './NodeInspector.tsx';
import { StoryNodeComponent, type StoryFlowNode, type StoryNodeData } from './StoryNode.tsx';

const nodeTypes = { story: StoryNodeComponent };

function toFlowNodes(data: MapData): StoryFlowNode[] {
  return data.nodes.map((n) => ({ id: n.id, type: 'story', position: n.position, data: n.data }));
}

function toFlowEdges(data: MapData): Edge[] {
  return data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}

function toMapData(
  nodes: StoryFlowNode[],
  edges: Edge[],
  viewport: Viewport,
  layoutDirection: MapDirection,
): MapData {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    layoutDirection,
  };
}

const STATUS_KEY = {
  saved: 'maps.canvas.status.saved',
  dirty: 'maps.canvas.status.dirty',
  saving: 'maps.canvas.status.saving',
  error: 'maps.canvas.status.error',
} as const satisfies Record<MapSaveState, MessageKey>;

export interface MapCanvasProps {
  bookId: string;
  map: StoryMap;
  sectionTargets: ReadonlyMap<string, LinkTarget>;
  entryTitles: ReadonlyMap<string, string>;
  sectionOptions: SectionOption[];
  entryOptions: EntryOption[];
  onOpenLink: (link: MapLink) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function MapCanvasInner({
  bookId,
  map,
  sectionTargets,
  entryTitles,
  sectionOptions,
  entryOptions,
  onOpenLink,
}: MapCanvasProps) {
  const t = useT();
  const client = useQueryClient();
  const { screenToFlowPosition, fitView, deleteElements, getViewport } = useReactFlow();
  const readOnly = map.damaged;
  const [nodes, setNodes] = useState<StoryFlowNode[]>(() => toFlowNodes(map.data));
  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(map.data));
  const [direction, setDirection] = useState<MapDirection>(map.data.layoutDirection);
  const [saveState, setSaveState] = useState<MapSaveState>('saved');
  const [saveFailure, setSaveFailure] = useState<{ cause: unknown } | null>(null);
  const [deleted, setDeleted] = useState<{ nodes: StoryFlowNode[]; edges: Edge[] } | null>(null);
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const [changes, setChanges] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const viewport = useRef<Viewport>({ ...map.data.viewport });
  const latest = useRef({ nodes, edges, direction });

  const [saver] = useState(
    () =>
      new MapSaver(map.id, {
        transport: { save: (id, data, options) => putMapData(id, data, options) },
        onChange: (s) => {
          setSaveState(s.state);
          setSaveFailure(s.state === 'error' ? { cause: s.cause } : null);
        },
      }),
  );

  useEffect(() => {
    latest.current = { nodes, edges, direction };
  });

  // Leaving the map (or the page) saves what is still waiting; a failure is reported once.
  useEffect(() => {
    const release = trackMapSaver(saver);
    return () => {
      void saver.flush().then(() => {
        release();
        if (saver.state === 'error') {
          useWorkspaceStore.getState().notify({
            tone: 'error',
            message: translateNow('maps.canvas.saveFailed', {
              title: map.title,
              error: apiErrorMessage(saver.cause),
            }),
          });
        }
      });
      saver.dispose();
    };
  }, [saver, map.title]);

  // Every persistable change lands here, so the saved data is always built from the newest state.
  useEffect(() => {
    if (changes === 0) return;
    const data = toMapData(
      latest.current.nodes,
      latest.current.edges,
      viewport.current,
      latest.current.direction,
    );
    cacheMapData(client, bookId, map.id, data);
    saver.update(data);
  }, [changes, client, bookId, map.id, saver]);

  const touch = useCallback(() => setChanges((n) => n + 1), []);
  const notifyError = (message: string) =>
    useWorkspaceStore.getState().notify({ tone: 'error', message });

  const onNodesChange = useCallback(
    (list: NodeChange<StoryFlowNode>[]) => {
      if (readOnly) return;
      setNodes((current) => applyNodeChanges(list, current));
      const persistable = list.some(
        (c) =>
          c.type === 'remove' || c.type === 'add' || (c.type === 'position' && c.dragging !== true),
      );
      if (persistable) touch();
    },
    [readOnly, touch],
  );

  const onEdgesChange = useCallback(
    (list: EdgeChange[]) => {
      if (readOnly) return;
      setEdges((current) => applyEdgeChanges(list, current));
      if (list.some((c) => c.type === 'remove' || c.type === 'add')) touch();
    },
    [readOnly, touch],
  );

  const addNodeAt = (position: { x: number; y: number }, data: Partial<StoryNodeData> = {}) => {
    if (nodes.length >= MAP_MAX_NODES) {
      notifyError(t('maps.canvas.maxNodes', { max: MAP_MAX_NODES }));
      return null;
    }
    const id = crypto.randomUUID();
    const node: StoryFlowNode = {
      id,
      type: 'story',
      position,
      selected: true,
      data: {
        title: t('maps.canvas.newNodeTitle'),
        description: '',
        color: DEFAULT_NODE_COLOR,
        storyTime: '',
        links: [],
        ...data,
      },
    };
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), node]);
    setEdges((current) => current.map((e) => ({ ...e, selected: false })));
    setFocusTitleId(id);
    touch();
    return id;
  };

  const addNode = () => {
    const box = wrapper.current?.getBoundingClientRect();
    const center = box
      ? screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
      : { x: 0, y: 0 };
    addNodeAt({
      x: Math.round(center.x - NODE_WIDTH / 2),
      y: Math.round(center.y - NODE_HEIGHT / 2),
    });
  };

  const connect = (source: string, target: string): boolean => {
    if (source === target || edges.some((e) => e.source === source && e.target === target)) {
      return false;
    }
    if (edges.length >= MAP_MAX_EDGES) {
      notifyError(t('maps.canvas.maxEdges', { max: MAP_MAX_EDGES }));
      return false;
    }
    setEdges((current) =>
      addEdge(
        {
          id: crypto.randomUUID(),
          source,
          target,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        current,
      ),
    );
    touch();
    return true;
  };

  const addChild = (parentId: string) => {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const siblings = edges.filter((e) => e.source === parentId).length;
    const position =
      direction === 'TB'
        ? {
            x: parent.position.x + siblings * (NODE_WIDTH + 40),
            y: parent.position.y + NODE_HEIGHT + 70,
          }
        : {
            x: parent.position.x + NODE_WIDTH + 70,
            y: parent.position.y + siblings * (NODE_HEIGHT + 40),
          };
    const id = addNodeAt(position, { color: parent.data.color });
    if (id) connect(parentId, id);
  };

  const arrange = (to: MapDirection) => {
    const sizes = new Map(
      nodes.flatMap((n) =>
        n.measured?.width && n.measured.height
          ? [[n.id, { width: n.measured.width, height: n.measured.height }] as const]
          : [],
      ),
    );
    const laid = layoutMap(toMapData(nodes, edges, viewport.current, direction), to, sizes);
    const positions = new Map(laid.nodes.map((n) => [n.id, n.position]));
    setNodes((current) =>
      current.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
    );
    setDirection(to);
    touch();
    // The new view is saved with the new positions, once the animation has ended.
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 250 }).then(() => {
        viewport.current = getViewport();
        touch();
      });
    }, 60);
  };

  const undoDelete = () => {
    if (!deleted) return;
    const existing = new Set(nodes.map((n) => n.id));
    const restoredNodes = deleted.nodes.filter((n) => !existing.has(n.id));
    const all = new Set([...existing, ...restoredNodes.map((n) => n.id)]);
    const known = new Set(edges.map((e) => e.id));
    const restoredEdges = deleted.edges.filter(
      (e) => !known.has(e.id) && all.has(e.source) && all.has(e.target),
    );
    setNodes((current) => [...current, ...restoredNodes.map((n) => ({ ...n, selected: false }))]);
    setEdges((current) => [...current, ...restoredEdges.map((e) => ({ ...e, selected: false }))]);
    setDeleted(null);
    touch();
  };

  const updateNodeData = (id: string, patch: Partial<StoryNodeData>) => {
    setNodes((current) =>
      current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
    touch();
  };

  const updateEdgeLabel = (id: string, label: string) => {
    setEdges((current) =>
      current.map((e) => (e.id === id ? { ...e, label: label || undefined } : e)),
    );
    touch();
  };

  // Node components call addChild through a ref, so dragging does not re-render every node.
  const addChildRef = useRef(addChild);
  useEffect(() => {
    addChildRef.current = addChild;
  });
  const linkTexts = useMemo<LinkTexts>(
    () => ({
      untitled: t('common.untitled'),
      missing: t('maps.link.missing'),
      inTrash: (title) => t('maps.link.inTrash', { title }),
    }),
    [t],
  );
  const flowLabels = useMemo(
    () => ({
      'node.a11yDescription.default': t('maps.flow.nodeDescription'),
      'node.a11yDescription.keyboardDisabled': t('maps.flow.nodeDescriptionMovable'),
      'node.a11yDescription.ariaLiveMessage': ({
        direction,
        x,
        y,
      }: {
        direction: string;
        x: number;
        y: number;
      }) => {
        const key = (
          {
            up: 'maps.flow.up',
            down: 'maps.flow.down',
            left: 'maps.flow.left',
            right: 'maps.flow.right',
          } as Record<string, MessageKey | undefined>
        )[direction];
        return t('maps.flow.nodeMoved', { direction: key ? t(key) : direction, x, y });
      },
      'edge.a11yDescription.default': t('maps.flow.edgeDescription'),
      'controls.ariaLabel': t('maps.flow.controls'),
      'controls.zoomIn.ariaLabel': t('maps.flow.zoomIn'),
      'controls.zoomOut.ariaLabel': t('maps.flow.zoomOut'),
      'controls.fitView.ariaLabel': t('maps.flow.fitView'),
      'controls.interactive.ariaLabel': t('maps.flow.interactive'),
      'minimap.ariaLabel': t('maps.flow.minimap'),
      'handle.ariaLabel': t('maps.flow.handle'),
    }),
    [t],
  );
  const context = useMemo<MapCanvasContextValue>(
    () => ({
      direction,
      readOnly,
      resolveLink: (link) => resolveMapLink(link, sectionTargets, entryTitles, linkTexts),
      openLink: onOpenLink,
      addChild: (parentId) => addChildRef.current(parentId),
    }),
    [direction, readOnly, sectionTargets, entryTitles, linkTexts, onOpenLink],
  );

  const saveError = saveFailure ? apiErrorMessage(saveFailure.cause) : null;
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const selectedEdge =
    !selectedNode && selectedNodes.length === 0 && selectedEdges.length === 1
      ? selectedEdges[0]
      : undefined;
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title ?? '';
  const startsAtDefaultView =
    map.data.viewport.x === EMPTY_VIEWPORT.x &&
    map.data.viewport.y === EMPTY_VIEWPORT.y &&
    map.data.viewport.zoom === EMPTY_VIEWPORT.zoom;

  return (
    <MapCanvasContext.Provider value={context}>
      <div className={styles.editor}>
        <div className={styles.canvas} ref={wrapper} data-testid="map-canvas">
          {readOnly ? (
            <p className={styles.banner} role="alert">
              {t('maps.canvas.readOnly')}
            </p>
          ) : null}
          <ReactFlow
            ariaLabelConfig={flowLabels}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(c: Connection) => c.source && c.target && connect(c.source, c.target)}
            isValidConnection={(c) => c.source !== c.target}
            onDelete={({ nodes: gone, edges: goneEdges }) =>
              setDeleted({ nodes: gone as StoryFlowNode[], edges: goneEdges })
            }
            onMoveEnd={(event, vp) => {
              viewport.current = vp;
              // Only the user's own panning and zooming is saved; automatic moves save themselves.
              if (event && !readOnly) touch();
            }}
            onInit={() => {
              if (startsAtDefaultView && map.data.nodes.length > 0) {
                void fitView({ padding: 0.2 }).then(() => {
                  viewport.current = getViewport();
                });
              }
            }}
            defaultViewport={map.data.viewport}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            minZoom={0.1}
            maxZoom={2}
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data as StoryNodeData).color} />
            <Panel position="top-left" className={styles.toolbar}>
              {readOnly ? null : (
                <>
                  <button type="button" className={styles.toolButton} onClick={addNode}>
                    <Plus size={14} /> {t('maps.canvas.addNode')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.toolButton} ${direction === 'TB' ? styles.toolOn : ''}`}
                    onClick={() => arrange('TB')}
                    aria-label={t('maps.canvas.layoutDown')}
                    title={t('maps.canvas.layoutDownTitle')}
                  >
                    <ArrowDown size={14} /> {t('maps.canvas.layout')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.toolButton} ${direction === 'LR' ? styles.toolOn : ''}`}
                    onClick={() => arrange('LR')}
                    aria-label={t('maps.canvas.layoutRight')}
                    title={t('maps.canvas.layoutRightTitle')}
                  >
                    <ArrowRight size={14} /> {t('maps.canvas.layout')}
                  </button>
                  {deleted ? (
                    <button type="button" className={styles.toolButton} onClick={undoDelete}>
                      <Undo2 size={14} /> {t('maps.canvas.undoDelete')}
                    </button>
                  ) : null}
                </>
              )}
              <span
                className={`${styles.saveStatus} ${saveState === 'error' ? styles.saveError : ''}`}
                role="status"
                data-testid="map-save-status"
                title={saveError ?? undefined}
              >
                {t(STATUS_KEY[saveState])}
                {saveError ? ` — ${saveError}` : ''}
              </span>
            </Panel>
          </ReactFlow>
        </div>
        {selectedNode ? (
          <NodeInspector
            key={selectedNode.id}
            data={selectedNode.data}
            readOnly={readOnly}
            autoFocusTitle={focusTitleId === selectedNode.id}
            sections={sectionOptions}
            entries={entryOptions}
            resolveLink={context.resolveLink}
            openLink={onOpenLink}
            onChange={(patch) => updateNodeData(selectedNode.id, patch)}
            onDelete={() => void deleteElements({ nodes: [{ id: selectedNode.id }] })}
          />
        ) : selectedEdge ? (
          <EdgeInspector
            key={selectedEdge.id}
            label={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
            from={titleOf(selectedEdge.source)}
            to={titleOf(selectedEdge.target)}
            readOnly={readOnly}
            onLabel={(label) => updateEdgeLabel(selectedEdge.id, label)}
            onDelete={() => void deleteElements({ edges: [{ id: selectedEdge.id }] })}
          />
        ) : (
          <aside className={styles.inspector}>
            <p className={styles.muted}>{t('maps.canvas.hint')}</p>
          </aside>
        )}
      </div>
    </MapCanvasContext.Provider>
  );
}

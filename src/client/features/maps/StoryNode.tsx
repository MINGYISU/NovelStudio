import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Link2, Plus } from 'lucide-react';
import { memo } from 'react';
import type { MapNode } from '../../../shared/schemas/map.ts';
import { useT } from '../../i18n/index.ts';
import styles from './maps.module.css';
import { useMapCanvas } from './map-context.ts';

export type StoryNodeData = MapNode['data'];
export type StoryFlowNode = Node<StoryNodeData, 'story'>;

/** MAP-03/05/07/09: title, story time, color strip, link chips and the `+` child handle. */
function StoryNodeView({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const t = useT();
  const { direction, readOnly, resolveLink, openLink, addChild } = useMapCanvas();
  const vertical = direction === 'TB';
  return (
    <div
      className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
      style={{ borderLeftColor: data.color }}
      data-testid="map-node"
    >
      <Handle
        type="target"
        position={vertical ? Position.Top : Position.Left}
        isConnectable={!readOnly}
      />
      {data.storyTime ? <div className={styles.nodeTime}>{data.storyTime}</div> : null}
      <div className={styles.nodeTitle}>{data.title || t('common.untitled')}</div>
      {data.description ? <div className={styles.nodeText}>{data.description}</div> : null}
      {data.links.length > 0 ? (
        <div className={`${styles.chips} nodrag nopan`}>
          {data.links.map((link) => {
            const resolved = resolveLink(link);
            return (
              <button
                key={`${link.type}:${link.id}`}
                type="button"
                className={`${styles.chip} ${resolved.state !== 'ok' ? styles.chipMuted : ''}`}
                disabled={resolved.state !== 'ok'}
                title={link.type === 'node' ? t('maps.node.openSection') : t('maps.node.openEntry')}
                onClick={() => openLink(link)}
              >
                <Link2 size={11} /> {resolved.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <Handle
        type="source"
        position={vertical ? Position.Bottom : Position.Right}
        isConnectable={!readOnly}
      />
      {readOnly ? null : (
        <button
          type="button"
          className={`${styles.addChild} ${vertical ? styles.addChildBottom : styles.addChildRight} nodrag nopan`}
          aria-label={t('maps.node.addChild')}
          title={t('maps.node.addChild')}
          onClick={() => addChild(id)}
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}

export const StoryNodeComponent = memo(StoryNodeView);

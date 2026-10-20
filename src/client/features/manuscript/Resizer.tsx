import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { SIDEBAR_MAX, SIDEBAR_MIN, useWorkspaceStore } from '../../stores/workspace.ts';
import styles from './manuscript.module.css';

const KEY_STEP = 16;

export function Resizer() {
  const width = useWorkspaceStore((s) => s.sidebarWidth);
  const setWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setWidth(drag.current.startWidth + event.clientX - drag.current.startX);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setWidth(width - KEY_STEP);
    else if (event.key === 'ArrowRight') setWidth(width + KEY_STEP);
  };

  return (
    <div
      className={styles.resizer}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKeyDown}
    />
  );
}

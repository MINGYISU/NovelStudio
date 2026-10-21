import { createContext, useContext } from 'react';
import type { ResolvedLink } from '../../../shared/map-links.ts';
import type { MapDirection, MapLink } from '../../../shared/schemas/map.ts';

export interface MapCanvasContextValue {
  direction: MapDirection;
  readOnly: boolean;
  resolveLink: (link: MapLink) => ResolvedLink;
  openLink: (link: MapLink) => void;
  addChild: (parentId: string) => void;
}

export const MapCanvasContext = createContext<MapCanvasContextValue | null>(null);

export function useMapCanvas(): MapCanvasContextValue {
  const value = useContext(MapCanvasContext);
  if (!value) throw new Error('MapCanvasContext is missing.');
  return value;
}

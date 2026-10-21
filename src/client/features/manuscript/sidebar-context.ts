import { createContext, useContext } from 'react';
import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import type { TreeActions } from './useTreeActions.ts';

export const SidebarContext = createContext<TreeActions | null>(null);

export function useSidebarActions(): TreeActions {
  const actions = useContext(SidebarContext);
  if (!actions) throw new Error('SidebarContext is missing');
  return actions;
}

const NO_WARNINGS: ReadonlyMap<string, ForeshadowWarning[]> = new Map();

/** Foreshadow warnings per section id, for the badges (FS-06). */
export const SectionWarningsContext =
  createContext<ReadonlyMap<string, ForeshadowWarning[]>>(NO_WARNINGS);

export function useSectionWarnings(nodeId: string): ForeshadowWarning[] | undefined {
  return useContext(SectionWarningsContext).get(nodeId);
}

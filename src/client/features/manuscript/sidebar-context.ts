import { createContext, useContext } from 'react';
import type { TreeActions } from './useTreeActions.ts';

export const SidebarContext = createContext<TreeActions | null>(null);

export function useSidebarActions(): TreeActions {
  const actions = useContext(SidebarContext);
  if (!actions) throw new Error('SidebarContext is missing');
  return actions;
}

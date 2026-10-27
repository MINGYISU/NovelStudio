import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { httpSaveTransport } from '../../api/content.ts';
import { mapSavers } from '../maps/map-saver.ts';
import {
  SaverRegistry,
  type OverallStatus,
  type SaveState,
  type SectionSaver,
} from './autosave.ts';
import { hasUnsavedWork } from './unsaved-work.ts';

/** The one registry of section savers for this page. */
export const saverRegistry = new SaverRegistry({ transport: httpSaveTransport });

export const useSaveStatus = create<{ status: OverallStatus }>((set) => {
  saverRegistry.subscribe(() => set({ status: saverRegistry.status() }));
  return { status: { kind: 'saved' } };
});

// ED-05: save when the tab is hidden and when the page unloads. `visibilitychange` comes first and
// uses a normal request; `pagehide` is the last chance, so it asks for a keepalive request.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saverRegistry.flushAll();
  });
  window.addEventListener('pagehide', () => void saverRegistry.flushAll({ keepalive: true }));
  // ED-12: closing or leaving the page while anything is unsaved, saving or failed asks first.
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedWork(saverRegistry.all(), mapSavers())) return;
    event.preventDefault();
    // Older Chromium versions still need returnValue set to show the prompt.
    event.returnValue = true;
  });
}

/** Re-renders when this section's saver changes state. */
export function useSaverState(saver: SectionSaver): SaveState {
  return useSyncExternalStore(
    (listener) => saverRegistry.subscribe(listener),
    () => saver.state,
  );
}

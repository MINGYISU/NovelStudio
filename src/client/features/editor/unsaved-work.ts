import type { MapSaveState } from '../maps/map-saver.ts';
import type { ContentDoc } from '../../../shared/schemas/content.ts';
import type { SaveState } from './autosave.ts';

export interface SectionSaverView {
  state: SaveState;
  unsavedContent(): ContentDoc | null;
}

export interface MapSaverView {
  state: MapSaveState;
  hasUnsaved(): boolean;
}

/**
 * True while any section or map holds text or data the server does not have yet: changed, being
 * saved, failed, or rejected as stale (ED-12). Leaving the page then asks first.
 */
export function hasUnsavedWork(
  sections: Iterable<SectionSaverView>,
  maps: Iterable<MapSaverView>,
): boolean {
  for (const saver of sections) {
    if (saver.state !== 'saved' || saver.unsavedContent() !== null) return true;
  }
  for (const saver of maps) {
    if (saver.state !== 'saved' || saver.hasUnsaved()) return true;
  }
  return false;
}

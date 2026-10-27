import { useCallback, useState, type ReactNode } from 'react';
import { Button, Dialog, uiStyles } from '../../components/ui.tsx';
import { saverRegistry } from '../editor/save-registry.ts';
import { hasUnsavedWork } from '../editor/unsaved-work.ts';
import { mapSavers } from '../maps/map-saver.ts';

/**
 * Saves everything still pending before an export reads from the server (EXP-01, COLD-02, ED-12).
 * Maps only matter for cold backups. True when nothing is left unsaved.
 */
export async function flushForExport(includeMaps: boolean): Promise<boolean> {
  const maps = includeMaps ? mapSavers() : [];
  await Promise.all([saverRegistry.flushAll(), ...maps.map((s) => s.flush())]);
  return !hasUnsavedWork(saverRegistry.all(), maps);
}

/** Starts a file download from code (after the flush), like clicking a download link. */
export function triggerDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * `guard(includeMaps, proceed)` flushes pending saves, then runs `proceed`; if something could not
 * be saved it first asks, through the returned `element`, whether to export anyway.
 */
export function useExportGuard(): {
  guard: (includeMaps: boolean, proceed: () => void) => void;
  element: ReactNode;
} {
  const [pending, setPending] = useState<{ proceed: () => void } | null>(null);
  const guard = useCallback((includeMaps: boolean, proceed: () => void) => {
    void flushForExport(includeMaps).then((saved) => {
      if (saved) proceed();
      else setPending({ proceed });
    });
  }, []);
  const element = pending ? (
    <Dialog open onOpenChange={(open) => !open && setPending(null)} title="Unsaved text">
      <p>Some text is not saved and will not be in the export.</p>
      <div className={uiStyles.actions}>
        <Button autoFocus onClick={() => setPending(null)}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setPending(null);
            pending.proceed();
          }}
        >
          Export anyway
        </Button>
      </div>
    </Dialog>
  ) : null;
  return { guard, element };
}

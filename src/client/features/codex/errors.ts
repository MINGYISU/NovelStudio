import { useWorkspaceStore } from '../../stores/workspace.ts';

/** Shows a failed codex request in the notice bar; the message comes from the server. */
export function reportCodexError(action: string): (error: Error) => void {
  return (error) =>
    useWorkspaceStore.getState().notify({ tone: 'error', message: `${action} ${error.message}` });
}

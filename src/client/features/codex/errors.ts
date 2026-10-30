import { apiErrorMessage } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';

/** Shows a failed codex request in the notice bar; `action` is already translated. */
export function reportCodexError(action: string): (error: Error) => void {
  return (error) =>
    useWorkspaceStore
      .getState()
      .notify({ tone: 'error', message: `${action} ${apiErrorMessage(error)}` });
}

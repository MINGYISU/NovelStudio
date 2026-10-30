import type { ForeshadowStatus, OccurrenceRole } from '../../../shared/schemas/foreshadow.ts';
import type { TFunction } from '../../i18n/index.ts';

/** I18N-07: occurrence roles and thread statuses in the interface language. */
export function roleLabel(t: TFunction, role: OccurrenceRole): string {
  return t(`foreshadow.role.${role}`);
}

export function statusLabel(t: TFunction, status: ForeshadowStatus): string {
  return t(`foreshadow.status.${status}`);
}

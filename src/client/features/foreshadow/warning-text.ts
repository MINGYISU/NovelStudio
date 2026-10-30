import type { ForeshadowWarning } from '../../../shared/foreshadow.ts';
import type { TFunction } from '../../i18n/index.ts';

/** I18N-07: a warning's text in the interface language, built from its kind and thread title. */
export function warningText(
  t: TFunction,
  warning: Pick<ForeshadowWarning, 'kind' | 'threadTitle'>,
): string {
  return t(`foreshadow.warning.${warning.kind}`, { title: warning.threadTitle });
}

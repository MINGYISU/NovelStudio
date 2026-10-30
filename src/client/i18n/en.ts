import { en as codex } from './messages/codex.ts';
import { en as common } from './messages/common.ts';
import { en as editor } from './messages/editor.ts';
import { en as foreshadow } from './messages/foreshadow.ts';
import { en as images } from './messages/images.ts';
import { en as library } from './messages/library.ts';
import { en as maps } from './messages/maps.ts';
import { en as settings } from './messages/settings.ts';
import { en as workspace } from './messages/workspace.ts';

/** The source of truth for message keys; `zh-CN.ts` must have exactly the same keys. */
export const en = {
  ...common,
  ...library,
  ...settings,
  ...workspace,
  ...editor,
  ...codex,
  ...maps,
  ...foreshadow,
  ...images,
} as const;

export type MessageKey = keyof typeof en;

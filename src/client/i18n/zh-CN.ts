import type { MessageKey } from './en.ts';
import { zh as codex } from './messages/codex.ts';
import { zh as common } from './messages/common.ts';
import { zh as editor } from './messages/editor.ts';
import { zh as foreshadow } from './messages/foreshadow.ts';
import { zh as library } from './messages/library.ts';
import { zh as maps } from './messages/maps.ts';
import { zh as settings } from './messages/settings.ts';
import { zh as workspace } from './messages/workspace.ts';

/** A missing or extra key is a compile error. */
export const zhCN: Record<MessageKey, string> = {
  ...common,
  ...library,
  ...settings,
  ...workspace,
  ...editor,
  ...codex,
  ...maps,
  ...foreshadow,
};

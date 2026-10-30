import * as codex from './messages/codex.ts';
import * as common from './messages/common.ts';
import * as editor from './messages/editor.ts';
import * as foreshadow from './messages/foreshadow.ts';
import * as images from './messages/images.ts';
import * as library from './messages/library.ts';
import * as maps from './messages/maps.ts';
import * as settings from './messages/settings.ts';
import * as workspace from './messages/workspace.ts';

/** Every message file by name; the tests use it to find a key defined twice. */
export const MESSAGE_AREAS = {
  common,
  library,
  settings,
  workspace,
  editor,
  codex,
  maps,
  foreshadow,
  images,
};

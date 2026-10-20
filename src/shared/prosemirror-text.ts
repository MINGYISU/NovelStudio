import type { ContentNode } from './schemas/content.ts';

const SCENE_BREAK = '* * *';

function inlineText(node: ContentNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockTexts(node: ContentNode): string[] {
  switch (node.type) {
    case 'horizontalRule':
      return [SCENE_BREAK];
    case 'blockquote':
      return (node.content ?? []).flatMap(blockTexts);
    case 'doc':
      return (node.content ?? []).flatMap(blockTexts);
    default: {
      const text = inlineText(node);
      return text.trim() === '' ? [] : [text];
    }
  }
}

/**
 * Readable text of a document: one block per paragraph, heading or quote paragraph, separated by
 * blank lines; a scene break becomes `* * *`; empty paragraphs are dropped.
 */
export function docToPlainText(doc: ContentNode): string {
  return blockTexts(doc).join('\n\n');
}

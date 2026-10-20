import { z } from 'zod';

/** Everything the editor can store (PRD ED-02); anything else is refused before it reaches the database. */
export const NODE_TYPES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'horizontalRule',
  'hardBreak',
] as const;
export const MARK_TYPES = ['bold', 'italic', 'underline', 'strike', 'highlight'] as const;
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fff3a3' },
  { name: 'Green', value: '#c9f0c9' },
  { name: 'Blue', value: '#c7e1ff' },
  { name: 'Pink', value: '#ffd1e3' },
  { name: 'Orange', value: '#ffd9b0' },
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

export interface ContentMark {
  type: (typeof MARK_TYPES)[number];
  attrs?: Record<string, unknown>;
}

export interface ContentNode {
  type: (typeof NODE_TYPES)[number];
  attrs?: Record<string, unknown>;
  content?: ContentNode[];
  marks?: ContentMark[];
  text?: string;
}

export interface ContentDoc extends ContentNode {
  type: 'doc';
}

export const EMPTY_DOC: ContentDoc = { type: 'doc', content: [] };

const markSchema: z.ZodType<ContentMark> = z.object({
  type: z.enum(MARK_TYPES),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const nodeSchema: z.ZodType<ContentNode> = z.lazy(() =>
  z.object({
    type: z.enum(NODE_TYPES),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(nodeSchema).optional(),
    marks: z.array(markSchema).optional(),
    text: z.string().optional(),
  }),
);

function checkNode(node: ContentNode, depth: number, ctx: z.RefinementCtx): void {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (depth > 6) return fail('Content is nested too deeply.');
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text === '') fail('Text nodes need text.');
    if (node.content) fail('Text nodes cannot have children.');
  } else if (node.text !== undefined) {
    fail('Only text nodes carry text.');
  }
  if (node.type === 'heading') {
    const level = node.attrs?.level;
    if (level !== 1 && level !== 2) fail('Headings are level 1 or 2.');
  }
  const align = node.attrs?.textAlign;
  if (
    align !== undefined &&
    align !== null &&
    !(TEXT_ALIGNMENTS as readonly unknown[]).includes(align)
  ) {
    fail('Unsupported text alignment.');
  }
  for (const mark of node.marks ?? []) {
    const color = mark.attrs?.color;
    if (
      mark.type === 'highlight' &&
      color != null &&
      !(typeof color === 'string' && HEX_COLOR.test(color))
    ) {
      fail('Highlight colors must be hex values.');
    }
  }
  for (const child of node.content ?? []) checkNode(child, depth + 1, ctx);
}

/** The document root; validates node types, marks and the few attributes the editor produces. */
export const contentSchema: z.ZodType<ContentDoc> = nodeSchema
  .refine((node): node is ContentDoc => node.type === 'doc', { message: 'Root must be a doc.' })
  .superRefine((doc, ctx) => checkNode(doc, 0, ctx));

/** A paragraph per blank-line-separated block; used when a backup has no usable `content`. */
export function docFromPlainText(text: string): ContentDoc {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block !== '');
  return {
    type: 'doc',
    content: blocks.map((block) => ({
      type: 'paragraph',
      content: block
        .split('\n')
        .flatMap((line, i): ContentNode[] => [
          ...(i > 0 ? [{ type: 'hardBreak' as const }] : []),
          ...(line === '' ? [] : [{ type: 'text' as const, text: line }]),
        ]),
    })),
  };
}

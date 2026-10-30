import { describe, expect, it } from 'vitest';
import { contentSchema } from './content.ts';
import { displaySettingsSchema, DEFAULT_DISPLAY } from './display.ts';

describe('contentSchema', () => {
  it('accepts what the editor produces', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }, { type: 'italic' }] }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'highlight', attrs: { color: '#fff3a3' } }],
            },
          ],
        },
        { type: 'horizontalRule' },
        { type: 'blockquote', content: [{ type: 'paragraph' }] },
      ],
    };
    expect(contentSchema.safeParse(doc).success).toBe(true);
    expect(contentSchema.safeParse({ type: 'doc', content: [] }).success).toBe(true);
  });

  it('accepts a foreshadow anchor with a UUID occurrence id', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'a',
              marks: [
                {
                  type: 'foreshadowAnchor',
                  attrs: { occurrenceId: '11111111-1111-4111-8111-111111111111' },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(contentSchema.safeParse(doc).success).toBe(true);
  });

  it.each([
    ['a non-doc root', { type: 'paragraph' }],
    ['an unknown node', { type: 'doc', content: [{ type: 'bulletList', content: [] }] }],
    ['an image', { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }],
    [
      'an unknown mark',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'x' } }] }],
          },
        ],
      },
    ],
    ['a level 3 heading', { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 } }] }],
    [
      'a non-hex highlight',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'a',
                marks: [{ type: 'highlight', attrs: { color: 'red; x' } }],
              },
            ],
          },
        ],
      },
    ],
    [
      'a bad alignment',
      { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'start' } }] },
    ],
    [
      'an empty text node',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
    ],
    ['text on a paragraph', { type: 'doc', content: [{ type: 'paragraph', text: 'a' }] }],
    ...[undefined, 'abc', 42].map((occurrenceId): [string, unknown] => [
      `a foreshadow anchor with id ${String(occurrenceId)}`,
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'a',
                marks: [{ type: 'foreshadowAnchor', attrs: { occurrenceId } }],
              },
            ],
          },
        ],
      },
    ]),
  ])('rejects %s', (_name, doc) => {
    expect(contentSchema.safeParse(doc).success).toBe(false);
  });
});

describe('displaySettingsSchema', () => {
  it('fills defaults and rejects out-of-range values', () => {
    expect(displaySettingsSchema.parse({})).toEqual(DEFAULT_DISPLAY);
    expect(displaySettingsSchema.safeParse({ fontSize: 80 }).success).toBe(false);
    expect(displaySettingsSchema.safeParse({ fontFamily: 'Comic Sans' }).success).toBe(false);
    expect(displaySettingsSchema.safeParse({ theme: 'neon' }).success).toBe(false);
  });

  it('shows images unless told otherwise (IMG-12)', () => {
    expect(displaySettingsSchema.parse({}).showImages).toBe(true);
    expect(displaySettingsSchema.parse({ showImages: false }).showImages).toBe(false);
    expect(DEFAULT_DISPLAY.showImages).toBe(true);
  });

  it('accepts the sepia theme, paragraph spacing and background options (DISP-02)', () => {
    expect(displaySettingsSchema.parse({ theme: 'sepia' }).theme).toBe('sepia');
    expect(DEFAULT_DISPLAY).toMatchObject({
      paragraphSpacing: 0.6,
      backgroundColor: null,
      backgroundImageAssetId: null,
      backgroundImageOpacity: 0.3,
    });
    expect(displaySettingsSchema.safeParse({ backgroundColor: '#f4ecd8' }).success).toBe(true);
    for (const bad of [
      { backgroundColor: 'red' },
      { backgroundColor: '#fff' },
      { paragraphSpacing: 3 },
      { backgroundImageOpacity: 0 },
      { backgroundImageOpacity: 1.5 },
      { backgroundImageAssetId: 'x' },
    ]) {
      expect(displaySettingsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('contentSchema images', () => {
  const image = {
    type: 'image',
    attrs: { assetId: '11111111-1111-4111-8111-111111111111', size: 'medium', caption: '' },
  };

  it('accepts a top-level image', () => {
    expect(contentSchema.safeParse({ type: 'doc', content: [image] }).success).toBe(true);
  });

  it.each([
    ['inside a paragraph', { type: 'doc', content: [{ type: 'paragraph', content: [image] }] }],
    ['inside a quote', { type: 'doc', content: [{ type: 'blockquote', content: [image] }] }],
    [
      'with a bad size',
      { type: 'doc', content: [{ ...image, attrs: { ...image.attrs, size: 'x' } }] },
    ],
    [
      'with a long caption',
      { type: 'doc', content: [{ ...image, attrs: { ...image.attrs, caption: 'x'.repeat(301) } }] },
    ],
    ['with children', { type: 'doc', content: [{ ...image, content: [{ type: 'hardBreak' }] }] }],
    ['without attributes', { type: 'doc', content: [{ type: 'image' }] }],
  ])('rejects an image %s', (_name, doc) => {
    expect(contentSchema.safeParse(doc).success).toBe(false);
  });
});

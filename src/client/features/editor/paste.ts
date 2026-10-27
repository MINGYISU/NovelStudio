import { ANCHOR_ATTRIBUTE, isOccurrenceId } from '../../../shared/foreshadow-anchors.ts';
import { HIGHLIGHT_COLORS, TEXT_ALIGNMENTS } from '../../../shared/schemas/content.ts';

function isBoldWeight(weight: string): boolean {
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
}

/** Google Docs wraps the whole clipboard in `<b style="font-weight:normal">`, which is not bold. */
function isNotBold(weight: string): boolean {
  return weight === 'normal' || weight === 'lighter' || (weight !== '' && Number(weight) < 600);
}

/** `#rrggbb` (lowercase) from a hex or `rgb(...)` color; `null` for anything else. */
function toHex(color: string): string | null {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*1)?\)$/.exec(value);
  if (!rgb) return null;
  return `#${rgb
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

const PALETTE: readonly string[] = HIGHLIGHT_COLORS.map((c) => c.value);

/** The highlight color of a `<mark>`, kept only if it is one of the editor's own colors (ED-04). */
function markColor(el: HTMLElement): string | null {
  const color = toHex(el.getAttribute('data-color') ?? '') ?? toHex(el.style.backgroundColor);
  return color !== null && PALETTE.includes(color) ? color : null;
}

/** Inline styles worth keeping: they map onto formatting the editor supports (ED-02). */
function cleanStyle(el: HTMLElement): void {
  const { fontWeight, fontStyle, textAlign } = el.style;
  const decoration = el.style.textDecorationLine || el.style.textDecoration;
  const keep: string[] = [];
  if (isBoldWeight(fontWeight)) {
    keep.push('font-weight: 700');
  }
  if (fontStyle === 'italic') keep.push('font-style: italic');
  const lines = [
    decoration.includes('underline') && 'underline',
    decoration.includes('line-through') && 'line-through',
  ];
  if (lines.some(Boolean)) keep.push(`text-decoration: ${lines.filter(Boolean).join(' ')}`);
  if ((TEXT_ALIGNMENTS as readonly string[]).includes(textAlign))
    keep.push(`text-align: ${textAlign}`);
  el.removeAttribute('style');
  if (keep.length > 0) el.setAttribute('style', keep.join('; '));
}

/**
 * Pasted HTML is untrusted and usually carries fonts, sizes and colors (ED-04). Everything except
 * bold/italic/underline/strike/alignment, palette highlight colors on `<mark>` and foreshadow
 * anchors is removed before the editor's schema filters the rest. Nested quotes are flattened.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script, style, meta, link, title, head, iframe, object, embed')
    .forEach((el) => el.remove());
  doc.querySelectorAll('font').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  doc.body.querySelectorAll<HTMLElement>('b, strong').forEach((el) => {
    if (isNotBold(el.style.fontWeight)) el.replaceWith(...Array.from(el.childNodes));
  });
  // Quotes never nest (ED-02): an inner quote becomes a plain block inside the outer one.
  doc.body.querySelectorAll('blockquote blockquote').forEach((el) => {
    const block = doc.createElement('div');
    block.append(...Array.from(el.childNodes));
    el.replaceWith(block);
  });
  doc.body.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const highlight = el.tagName === 'MARK' ? markColor(el) : null;
    cleanStyle(el);
    for (const attr of Array.from(el.attributes)) {
      // Cut-and-paste inside the app must keep an anchor with its text (FS-08).
      const keepAnchor = attr.name === ANCHOR_ATTRIBUTE && isOccurrenceId(attr.value);
      if (attr.name !== 'style' && !keepAnchor) el.removeAttribute(attr.name);
    }
    if (highlight !== null) el.setAttribute('data-color', highlight);
  });
  return doc.body.innerHTML;
}

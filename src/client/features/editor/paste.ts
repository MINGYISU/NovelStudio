import { ANCHOR_ATTRIBUTE, isOccurrenceId } from '../../../shared/foreshadow-anchors.ts';
import { TEXT_ALIGNMENTS } from '../../../shared/schemas/content.ts';

/** Inline styles worth keeping: they map onto formatting the editor supports (ED-02). */
function cleanStyle(el: HTMLElement): void {
  const { fontWeight, fontStyle, textAlign } = el.style;
  const decoration = el.style.textDecorationLine || el.style.textDecoration;
  const keep: string[] = [];
  if (fontWeight === 'bold' || fontWeight === 'bolder' || Number(fontWeight) >= 600) {
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
 * bold/italic/underline/strike/alignment (and foreshadow anchors) is removed before the editor's schema filters the rest.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script, style, meta, link, title, head, iframe, object, embed')
    .forEach((el) => el.remove());
  doc.querySelectorAll('font').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  doc.body.querySelectorAll<HTMLElement>('*').forEach((el) => {
    cleanStyle(el);
    for (const attr of Array.from(el.attributes)) {
      // Cut-and-paste inside the app must keep an anchor with its text (FS-08).
      const keepAnchor = attr.name === ANCHOR_ATTRIBUTE && isOccurrenceId(attr.value);
      if (attr.name !== 'style' && !keepAnchor) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

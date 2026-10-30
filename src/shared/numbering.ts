import { DEFAULT_STRUCTURE, type StructureSettings } from './schemas/structure.ts';
import { buildTree, type StructuralNode, type TreeBranch } from './tree.ts';
import type { NodeKind } from './types.ts';

export type NumberStyle = 'arabic' | 'roman' | 'roman-lower' | 'cn' | 'alpha';

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(n: number): string {
  let rest = n;
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** Bijective base 26: 1→A, 26→Z, 27→AA. */
export function toAlpha(n: number): string {
  let rest = n;
  let out = '';
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(65 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNITS = ['', '十', '百', '千'];

/** 1..9999, no leading 零 and no trailing 零. */
function cnBelowTenThousand(n: number): string {
  let out = '';
  let pendingZero = false;
  for (let place = 3; place >= 0; place--) {
    const digit = Math.floor(n / 10 ** place) % 10;
    if (digit === 0) {
      if (out !== '') pendingZero = true;
      continue;
    }
    if (pendingZero) out += '零';
    pendingZero = false;
    out += (CN_DIGITS[digit] ?? '') + (CN_UNITS[place] ?? '');
  }
  return out;
}

/** A leading group of 10..19 reads 十, 十一 … rather than 一十, 一十一 …. */
function cnLeadingGroup(n: number): string {
  const text = cnBelowTenThousand(n);
  return n >= 10 && n < 20 ? text.slice(1) : text;
}

function cnBelowHundredMillion(n: number, leading: boolean): string {
  if (n < 10000) return leading ? cnLeadingGroup(n) : cnBelowTenThousand(n);
  const high = Math.floor(n / 10000);
  const low = n % 10000;
  const head = (leading ? cnLeadingGroup(high) : cnBelowTenThousand(high)) + '万';
  if (low === 0) return head;
  return head + (low < 1000 ? '零' : '') + cnBelowTenThousand(low);
}

/** Standard Chinese numerals for 1 … 999,999,999,999. Larger values fall back to digits. */
export function toChineseNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return CN_DIGITS[0] as string;
  if (n < 1e8) return cnBelowHundredMillion(n, true);
  const high = Math.floor(n / 1e8);
  const low = n % 1e8;
  const head = cnBelowTenThousand(high) + '亿';
  if (low === 0) return head;
  return head + (low < 1e7 ? '零' : '') + cnBelowHundredMillion(low, false);
}

export function formatNumber(n: number, style: NumberStyle): string {
  switch (style) {
    case 'roman':
      return toRoman(n);
    case 'roman-lower':
      return toRoman(n).toLowerCase();
    case 'cn':
      return toChineseNumber(n);
    case 'alpha':
      return toAlpha(n);
    default:
      return String(n);
  }
}

const TOKEN = /\{n(?::(roman-lower|roman|cn|alpha))?\}/g;

/** Replaces `{n}`, `{n:roman}`, `{n:roman-lower}`, `{n:cn}` and `{n:alpha}`; other text is kept. */
export function formatLabel(format: string, n: number): string {
  return format.replace(TOKEN, (_match, style: NumberStyle | undefined) =>
    formatNumber(n, style ?? 'arabic'),
  );
}

export interface NumberableNode extends StructuralNode {
  title: string;
  numbered: boolean;
}

export const UNTITLED = '(untitled)';

/**
 * Display title for every live node, keyed by id. Trashed sections get no entry and never count.
 * Counting is depth-first pre-order; a counter restarts whenever a new section of its scope starts.
 */
export function computeDisplayTitles(
  nodes: readonly NumberableNode[],
  structure: StructureSettings = DEFAULT_STRUCTURE,
  untitled: string = UNTITLED,
): Map<string, string> {
  const titles = new Map<string, string>();
  const counters = new Map<string, number>();

  const walk = (
    branches: TreeBranch<NumberableNode>[],
    scopes: Partial<Record<NodeKind, string>>,
  ): void => {
    for (const { node, children } of branches) {
      const cfg = structure[node.kind];
      if (node.numbered) {
        const scopeId =
          cfg.restartWithin === 'book' ? 'root' : (scopes[cfg.restartWithin] ?? 'root');
        const key = `${node.kind}:${scopeId}`;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        const number = formatLabel(cfg.format, n);
        titles.set(node.id, node.title ? number + cfg.separator + node.title : number);
      } else {
        titles.set(node.id, node.title || untitled);
      }
      walk(children, { ...scopes, [node.kind]: node.id });
    }
  };

  walk(buildTree(nodes), {});
  return titles;
}

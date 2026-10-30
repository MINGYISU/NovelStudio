import {
  CODEX_LABEL_MAX,
  CODEX_MAX_FIELDS,
  CODEX_VALUE_MAX,
  type CodexCategory,
  type CodexEntry,
  type CodexFieldDef,
} from './schemas/codex.ts';
import { defaultCategories } from './seed-text.ts';

const ENGLISH_DEFAULTS = defaultCategories('en');

/** CDX-02 */
export const CHARACTER_FIELDS: readonly CodexFieldDef[] = ENGLISH_DEFAULTS[0]?.fieldTemplate ?? [];

/** CDX-03 */
export const GENERIC_FIELDS: readonly CodexFieldDef[] = ENGLISH_DEFAULTS[1]?.fieldTemplate ?? [];

export const CHARACTERS_CATEGORY_NAME = 'Characters';
const NAME_KEY = 'name';
const ALIASES_KEY = 'aliases';

/** CDX-01: the English categories every book starts with, in order. `defaultCategories(locale)` has the others. */
export const DEFAULT_CATEGORIES: readonly {
  name: string;
  fieldTemplate: readonly CodexFieldDef[];
}[] = ENGLISH_DEFAULTS.map((c, i) => ({
  name: c.name,
  fieldTemplate: i === 0 ? CHARACTER_FIELDS : GENERIC_FIELDS,
}));

/** The template for a category added by hand. */
export const NEW_CATEGORY_TEMPLATE: readonly CodexFieldDef[] = GENERIC_FIELDS;

/** A new entry starts from the category template with empty values (CDX-04). */
export function fieldsFromTemplate(template: readonly CodexFieldDef[]) {
  return template.map((def) => ({ ...def, value: '' }));
}

/** A field key for an entry-specific field; unique within the entry. */
export function newFieldKey(existing: readonly { key: string }[], seed: () => string): string {
  const taken = new Set(existing.map((f) => f.key));
  for (;;) {
    const key = `f-${seed()
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 8)}`;
    if (key.length > 2 && !taken.has(key)) return key;
  }
}

/**
 * The category that holds characters. A renamed Characters category keeps its `aliases` field, so
 * either the default name or that field marks it.
 */
export function isCharacterCategory(
  category: Pick<CodexCategory, 'name' | 'fieldTemplate'>,
): boolean {
  return (
    category.name.trim().toLowerCase() === CHARACTERS_CATEGORY_NAME.toLowerCase() ||
    category.fieldTemplate.some((f) => f.key === ALIASES_KEY)
  );
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ALIAS_SPLIT = /[,，、;；\n]+/;
const MIN_TERM_LENGTH = 2;

/** Names a character can be called in the text: title, Name field and each alias. */
export function characterTerms(entry: Pick<CodexEntry, 'title' | 'fields'>): string[] {
  const terms = new Set<string>();
  const add = (raw: string) => {
    const term = raw.trim();
    if (term.length >= MIN_TERM_LENGTH) terms.add(term);
  };
  add(entry.title);
  for (const field of entry.fields) {
    if (field.key === NAME_KEY) add(field.value);
    if (field.key === ALIASES_KEY) field.value.split(ALIAS_SPLIT).forEach(add);
  }
  return [...terms];
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);

/** Index of the first match, or -1. Latin terms match whole words only; CJK terms match anywhere. */
function firstIndex(haystack: string, term: string): number {
  const needle = term.toLowerCase();
  const wholeWord = !CJK.test(needle);
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    if (!wholeWord) return at;
    const before = at > 0 ? Array.from(haystack.slice(Math.max(0, at - 2), at)).at(-1) : undefined;
    const after = Array.from(haystack.slice(at + needle.length, at + needle.length + 2))[0];
    if (!isWordChar(before) && !isWordChar(after)) return at;
    from = at + 1;
  }
}

/** CDX-07: the characters named in a section's text, in order of first appearance. */
export function findMentionedCharacters<E extends Pick<CodexEntry, 'title' | 'fields'>>(
  characters: readonly E[],
  plainText: string,
): E[] {
  const haystack = plainText.toLowerCase();
  const hits: { entry: E; at: number }[] = [];
  for (const entry of characters) {
    const positions = characterTerms(entry)
      .map((term) => firstIndex(haystack, term))
      .filter((at) => at >= 0);
    if (positions.length > 0) hits.push({ entry, at: Math.min(...positions) });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.entry);
}

/**
 * CDX-05: entries containing every word of the query in the title, summary or a field value.
 * Title matches come first, then summary matches, then the rest; ties keep their order.
 */
export function searchEntries<E extends Pick<CodexEntry, 'title' | 'summary' | 'fields'>>(
  entries: readonly E[],
  query: string,
): E[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { entry: E; rank: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const title = entry.title.toLowerCase();
    const summary = entry.summary.toLowerCase();
    const rest = entry.fields.map((f) => f.value.toLowerCase()).join('\n');
    const all = `${title}\n${summary}\n${rest}`;
    if (!words.every((w) => all.includes(w))) return;
    const rank = words.every((w) => title.includes(w))
      ? 0
      : words.every((w) => summary.includes(w) || title.includes(w))
        ? 1
        : 2;
    scored.push({ entry, rank, index });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((s) => s.entry);
}

export interface Repaired<T> {
  items: T[];
  /** Human-readable notes about what had to change; empty when the input was already valid. */
  problems: string[];
}

/**
 * Makes untrusted field definitions or fields satisfy the app's rules (used when restoring a backup
 * file): keys are normalised and made unique, labels are never empty, and over-long values are cut.
 */
export function repairFields<T extends CodexFieldDef & { value?: string }>(
  fields: readonly T[],
): Repaired<T> {
  const problems: string[] = [];
  const taken = new Set<string>();
  const items: T[] = [];
  for (const field of fields) {
    if (items.length >= CODEX_MAX_FIELDS) {
      problems.push(`Only the first ${CODEX_MAX_FIELDS} fields were kept.`);
      break;
    }
    let key = field.key
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, 60);
    if (key === '') key = 'field';
    let unique = key;
    for (let n = 2; taken.has(unique); n += 1) unique = `${key}-${n}`;
    taken.add(unique);
    const label = field.label.trim().slice(0, CODEX_LABEL_MAX) || unique;
    const repaired = { ...field, key: unique, label };
    if (repaired.value !== undefined && repaired.value.length > CODEX_VALUE_MAX) {
      repaired.value = repaired.value.slice(0, CODEX_VALUE_MAX);
      problems.push(`The value of "${label}" was too long and was shortened.`);
    }
    if (unique !== field.key || label !== field.label) {
      problems.push(`Field "${field.label}" was renamed to fit the allowed format.`);
    }
    items.push(repaired);
  }
  return { items, problems };
}

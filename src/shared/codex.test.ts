import { describe, expect, it } from 'vitest';
import {
  CHARACTER_FIELDS,
  characterTerms,
  DEFAULT_CATEGORIES,
  fieldsFromTemplate,
  findMentionedCharacters,
  GENERIC_FIELDS,
  isCharacterCategory,
  newFieldKey,
  repairFields,
  searchEntries,
} from './codex.ts';
import { codexFieldDefSchema, createEntryBodySchema, entryFieldsSchema } from './schemas/codex.ts';

const entry = (title: string, values: Record<string, string> = {}, summary = '') => ({
  title,
  summary,
  fields: Object.entries(values).map(([key, value]) => ({
    key,
    label: key,
    type: 'text' as const,
    value,
  })),
});

describe('default templates (CDX-01..03)', () => {
  it('has the eight default categories, Characters first', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual([
      'Characters',
      'Locations',
      'Era & Timeline',
      'Culture & Traditions',
      'Organizations',
      'Creatures & Species',
      'Rules & Concepts',
      'Other',
    ]);
  });

  it('gives Characters the eleven PRD fields and every other category Description and Notes', () => {
    expect(CHARACTER_FIELDS.map((f) => f.label)).toEqual([
      'Name',
      'Aliases',
      'Role',
      'Age',
      'Appearance',
      'Background',
      'Personality',
      'Goals & Motivation',
      'Relationships',
      'Arc notes',
      'Notes',
    ]);
    expect(GENERIC_FIELDS.map((f) => f.label)).toEqual(['Description', 'Notes']);
    for (const category of DEFAULT_CATEGORIES.slice(1)) {
      expect(category.fieldTemplate).toBe(GENERIC_FIELDS);
    }
  });

  it('only uses valid, unique field keys', () => {
    for (const category of DEFAULT_CATEGORIES) {
      for (const field of category.fieldTemplate) {
        expect(codexFieldDefSchema.safeParse(field).success).toBe(true);
      }
      expect(entryFieldsSchema.safeParse(fieldsFromTemplate(category.fieldTemplate)).success).toBe(
        true,
      );
    }
  });

  it('starts an entry from the template with empty values and copies the definitions', () => {
    const fields = fieldsFromTemplate(GENERIC_FIELDS);
    expect(fields).toEqual([
      { key: 'description', label: 'Description', type: 'longtext', value: '' },
      { key: 'notes', label: 'Notes', type: 'longtext', value: '' },
    ]);
    fields[0]!.label = 'Changed';
    expect(GENERIC_FIELDS[0]!.label).toBe('Description');
  });
});

describe('newFieldKey', () => {
  it('produces a valid key that is not already taken', () => {
    const seeds = ['aaaaaaaa-1', 'aaaaaaaa-2', 'bbbbbbbb-3'];
    const key = newFieldKey([{ key: 'f-aaaaaaaa' }], () => seeds.shift()!);
    expect(key).toBe('f-bbbbbbbb');
    expect(codexFieldDefSchema.safeParse({ key, label: 'x', type: 'text' }).success).toBe(true);
  });
});

describe('isCharacterCategory', () => {
  it('recognises the default name in any case, or the aliases field after a rename', () => {
    expect(isCharacterCategory({ name: ' characters ', fieldTemplate: [] })).toBe(true);
    expect(isCharacterCategory({ name: '人物', fieldTemplate: [...CHARACTER_FIELDS] })).toBe(true);
    expect(isCharacterCategory({ name: 'Locations', fieldTemplate: [...GENERIC_FIELDS] })).toBe(
      false,
    );
  });
});

describe('characterTerms', () => {
  it('collects the title, the Name field and each alias, split on Latin and Chinese separators', () => {
    const terms = characterTerms(
      entry('Lin Yao', { name: 'Yao Lin', aliases: 'Little Yao, 阿遥，Captain; Y' }),
    );
    expect(terms.sort()).toEqual(['Captain', 'Lin Yao', 'Little Yao', 'Yao Lin', '阿遥'].sort());
  });

  it('ignores empty and one-character terms', () => {
    expect(characterTerms(entry('A', { name: ' ', aliases: ',,' }))).toEqual([]);
  });
});

describe('findMentionedCharacters (CDX-07)', () => {
  const lin = entry('Lin Yao', { aliases: 'Yao, the Captain' });
  const mo = entry('Mo Han');
  const cn = entry('林遥', { aliases: '阿遥' });
  const ann = entry('Ann');

  it('matches the title, the Name field and aliases, ignoring case', () => {
    expect(findMentionedCharacters([lin, mo], 'She called for LIN YAO.')).toEqual([lin]);
    expect(findMentionedCharacters([lin], 'Then the captain left.')).toEqual([lin]);
    expect(findMentionedCharacters([entry('X', { name: 'Mo Han' })], 'mo han smiled')).toHaveLength(
      1,
    );
  });

  it('returns characters in order of first appearance, once each', () => {
    const text = 'Mo Han waved. Lin Yao nodded. Mo Han left.';
    expect(findMentionedCharacters([lin, mo], text)).toEqual([mo, lin]);
  });

  it('matches Latin names as whole words only', () => {
    expect(findMentionedCharacters([ann], 'Joanna and Annabel arrived.')).toEqual([]);
    expect(findMentionedCharacters([ann], 'Joanna met Ann, finally.')).toEqual([ann]);
    expect(findMentionedCharacters([ann], "Ann's coat")).toEqual([ann]);
  });

  it('matches CJK names inside running text', () => {
    expect(findMentionedCharacters([cn], '雨停了，阿遥没有抬头。')).toEqual([cn]);
    expect(findMentionedCharacters([cn], '他看见林遥站在门口。')).toEqual([cn]);
    expect(findMentionedCharacters([cn], '没有人在那里。')).toEqual([]);
  });

  it('never matches an entry without usable names or in empty text', () => {
    expect(findMentionedCharacters([entry('', { aliases: '' })], 'anything at all')).toEqual([]);
    expect(findMentionedCharacters([lin], '')).toEqual([]);
  });
});

describe('searchEntries (CDX-05)', () => {
  const a = entry('Lin Yao', { background: 'Grew up by the harbour' }, 'A courier');
  const b = entry('Harbour Gate', { description: 'Where Lin Yao arrives' }, 'The old harbour');
  const c = entry('Mo Han', { notes: 'Owes a debt' });

  it('needs every word, across title, summary and field values', () => {
    expect(searchEntries([a, b, c], 'harbour')).toEqual([b, a]);
    expect(searchEntries([a, b, c], 'lin harbour')).toEqual([a, b]);
    expect(searchEntries([a, b, c], 'zebra')).toEqual([]);
  });

  it('ranks title matches, then summary matches, then field matches', () => {
    const fieldOnly = entry('Gate', { description: 'near the harbour' });
    const summaryOnly = entry('Quay', {}, 'harbour side');
    const titleHit = entry('Old Harbour');
    expect(searchEntries([fieldOnly, summaryOnly, titleHit], 'harbour')).toEqual([
      titleHit,
      summaryOnly,
      fieldOnly,
    ]);
  });

  it('is case-insensitive, finds CJK text, and returns nothing for a blank query', () => {
    expect(searchEntries([a], 'LIN')).toEqual([a]);
    expect(searchEntries([entry('林遥', { notes: '快递员' })], '快递')).toHaveLength(1);
    expect(searchEntries([a], '   ')).toEqual([]);
  });
});

describe('codex schemas', () => {
  it('rejects duplicate field keys and bad keys', () => {
    const f = (key: string) => ({ key, label: 'L', type: 'text' as const, value: '' });
    expect(entryFieldsSchema.safeParse([f('a'), f('a')]).success).toBe(false);
    expect(entryFieldsSchema.safeParse([f('Has Space')]).success).toBe(false);
    expect(entryFieldsSchema.safeParse([f('ok-1')]).success).toBe(true);
  });

  it('requires a title and a category for a new entry', () => {
    const categoryId = crypto.randomUUID();
    expect(createEntryBodySchema.safeParse({ categoryId, title: '  ' }).success).toBe(false);
    expect(createEntryBodySchema.safeParse({ categoryId, title: 'Lin' }).success).toBe(true);
  });
});

describe('repairFields', () => {
  const f = (key: string, label: string, value = '') => ({
    key,
    label,
    type: 'text' as const,
    value,
  });

  it('leaves valid fields untouched', () => {
    const fields = [f('name', 'Name', 'x'), f('notes', 'Notes')];
    expect(repairFields(fields)).toEqual({ items: fields, problems: [] });
  });

  it('normalises keys, makes them unique, and never leaves an empty label', () => {
    const { items, problems } = repairFields([
      f('Bad Key!', ''),
      f('bad-key-', 'Two'),
      f('', 'Three'),
    ]);
    expect(items.map((i) => i.key)).toEqual(['bad-key-', 'bad-key--2', 'field']);
    expect(items[0]!.label).toBe('bad-key-');
    expect(entryFieldsSchema.safeParse(items).success).toBe(true);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('shortens a value that is too long and reports it', () => {
    const { items, problems } = repairFields([f('a', 'A', 'x'.repeat(100_001))]);
    expect(items[0]!.value).toHaveLength(100_000);
    expect(problems[0]).toContain('shortened');
  });
});

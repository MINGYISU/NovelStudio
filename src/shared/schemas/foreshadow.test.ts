import { describe, expect, it } from 'vitest';
import {
  createOccurrenceBodySchema,
  createThreadBodySchema,
  foreshadowSettingsSchema,
  patchOccurrenceBodySchema,
  patchThreadBodySchema,
  DEFAULT_FORESHADOW_SETTINGS,
} from './foreshadow.ts';

const ID = '00000000-0000-4000-8000-00000000000a';

describe('foreshadow settings', () => {
  it('defaults the dormant threshold to 10', () => {
    expect(DEFAULT_FORESHADOW_SETTINGS).toEqual({ dormantAfter: 10 });
    expect(foreshadowSettingsSchema.parse({})).toEqual({ dormantAfter: 10 });
  });

  it('accepts whole numbers from 1 to 1000 only', () => {
    expect(foreshadowSettingsSchema.safeParse({ dormantAfter: 1 }).success).toBe(true);
    expect(foreshadowSettingsSchema.safeParse({ dormantAfter: 1000 }).success).toBe(true);
    for (const dormantAfter of [0, 1001, 2.5, '5', null]) {
      expect(foreshadowSettingsSchema.safeParse({ dormantAfter }).success).toBe(false);
    }
  });
});

describe('thread bodies', () => {
  it('trims the title and requires one', () => {
    expect(createThreadBodySchema.parse({ title: '  Compass ' }).title).toBe('Compass');
    expect(createThreadBodySchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(createThreadBodySchema.safeParse({}).success).toBe(false);
  });

  it('only allows the four statuses and #rrggbb colors', () => {
    for (const status of ['planned', 'planted', 'paid_off', 'abandoned']) {
      expect(createThreadBodySchema.safeParse({ title: 'x', status }).success).toBe(true);
    }
    expect(createThreadBodySchema.safeParse({ title: 'x', status: 'done' }).success).toBe(false);
    expect(createThreadBodySchema.safeParse({ title: 'x', color: '#ABCDEF' }).success).toBe(true);
    for (const color of ['red', '#abc', '#abcdeg', 'abcdef']) {
      expect(createThreadBodySchema.safeParse({ title: 'x', color }).success).toBe(false);
    }
  });

  it('limits text lengths', () => {
    expect(createThreadBodySchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(createThreadBodySchema.safeParse({ title: 'x', notes: 'n'.repeat(5001) }).success).toBe(
      false,
    );
  });

  it('a patch needs at least one field', () => {
    expect(patchThreadBodySchema.safeParse({}).success).toBe(false);
    expect(patchThreadBodySchema.safeParse({ notes: '' }).success).toBe(true);
  });
});

describe('occurrence bodies', () => {
  it('needs a section id and a role', () => {
    expect(createOccurrenceBodySchema.safeParse({ nodeId: ID, role: 'payoff' }).success).toBe(true);
    expect(createOccurrenceBodySchema.safeParse({ nodeId: 'x', role: 'payoff' }).success).toBe(
      false,
    );
    expect(createOccurrenceBodySchema.safeParse({ nodeId: ID, role: 'finale' }).success).toBe(
      false,
    );
    expect(createOccurrenceBodySchema.safeParse({ role: 'hint' }).success).toBe(false);
  });

  it('limits excerpt and note and requires a non-empty patch', () => {
    const long = 'x'.repeat(2001);
    expect(
      createOccurrenceBodySchema.safeParse({ nodeId: ID, role: 'hint', excerpt: long }).success,
    ).toBe(false);
    expect(patchOccurrenceBodySchema.safeParse({ note: long }).success).toBe(false);
    expect(patchOccurrenceBodySchema.safeParse({}).success).toBe(false);
    expect(patchOccurrenceBodySchema.safeParse({ role: 'setup' }).success).toBe(true);
  });
});

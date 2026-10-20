import { describe, expect, it } from 'vitest';
import {
  createBookBodySchema,
  deleteBookQuerySchema,
  listBooksQuerySchema,
  patchBookBodySchema,
} from './book.ts';

describe('book schemas', () => {
  it('trims and validates create bodies', () => {
    expect(createBookBodySchema.parse({ title: '  Hi  ' })).toEqual({ title: 'Hi' });
    expect(createBookBodySchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createBookBodySchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(
      createBookBodySchema.safeParse({ title: 'ok', description: 'x'.repeat(5001) }).success,
    ).toBe(false);
  });

  it('requires at least one field on patch and allows a null cover', () => {
    expect(patchBookBodySchema.safeParse({}).success).toBe(false);
    expect(patchBookBodySchema.safeParse({ coverAssetId: null }).success).toBe(true);
    expect(patchBookBodySchema.safeParse({ coverAssetId: 'not-a-uuid' }).success).toBe(false);
  });

  it('applies list defaults', () => {
    expect(listBooksQuerySchema.parse({})).toEqual({ sort: 'modified', trashed: false });
    expect(listBooksQuerySchema.parse({ sort: 'title', trashed: '1' })).toEqual({
      sort: 'title',
      trashed: true,
    });
    expect(listBooksQuerySchema.safeParse({ trashed: 'yes' }).success).toBe(false);
  });

  it('only treats purge=1 as a purge', () => {
    expect(deleteBookQuerySchema.parse({}).purge).toBe('0');
    expect(deleteBookQuerySchema.safeParse({ purge: 'true' }).success).toBe(false);
  });
});

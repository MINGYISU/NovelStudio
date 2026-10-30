import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../shared/error-codes.ts';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('error codes (I18N-04)', () => {
  it('lists every code the server source can return', () => {
    const root = path.resolve(import.meta.dirname);
    const found = new Set<string>();
    for (const file of sourceFiles(root)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/ApiError\(\s*[^,]+,\s*'([A-Z_]+)'/g))
        found.add(match[1]!);
      for (const match of source.matchAll(/\bcode:\s*'([A-Z][A-Z_]+)'/g)) found.add(match[1]!);
      for (const match of source.matchAll(/(?:fail|TreeRuleError)\(\s*'([A-Z_]+)'/g))
        found.add(match[1]!);
    }
    expect([...found].filter((code) => !(ERROR_CODES as readonly string[]).includes(code))).toEqual(
      [],
    );
  });

  it('has no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

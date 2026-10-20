import { describe, expect, it } from 'vitest';
import { countWords } from './wordcount.ts';

describe('countWords', () => {
  it('counts English words and ignores punctuation and whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\n  ')).toBe(0);
    expect(countWords('The rain had stopped.')).toBe(4);
    expect(countWords('Wait... what?! — yes.')).toBe(3);
    expect(countWords('* * *')).toBe(0);
  });

  it('keeps apostrophes and hyphens inside a word', () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords('well-known fact')).toBe(2);
    expect(countWords('rock ’n’ roll')).toBe(3);
    expect(countWords("'quoted'")).toBe(1);
  });

  it('counts digits as words', () => {
    expect(countWords('Chapter 12 of 3,000')).toBe(5);
  });

  it('counts every CJK character once', () => {
    expect(countWords('夜雨')).toBe(2);
    expect(countWords('她没有抬头。')).toBe(5);
    expect(countWords('ひらがなカタカナ')).toBe(8);
    expect(countWords('한국어')).toBe(3);
  });

  it('handles mixed text', () => {
    expect(countWords('Lin Yao 说：你好 world')).toBe(2 + 1 + 2 + 1);
    expect(countWords('abc你好def')).toBe(4);
  });
});

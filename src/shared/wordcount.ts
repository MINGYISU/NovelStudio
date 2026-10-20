const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}`;
const WORD_CHAR = String.raw`(?:(?![${CJK}])[\p{L}\p{N}\p{M}])`;
const TOKEN = new RegExp(`[${CJK}]|${WORD_CHAR}+(?:['’\\u2010-\\u2011-]${WORD_CHAR}+)*`, 'gu');

/**
 * Each CJK ideograph, kana or hangul syllable counts 1; each run of other letters or digits
 * (including apostrophes and hyphens inside a word) counts 1. Punctuation and whitespace count 0.
 */
export function countWords(text: string): number {
  return text.match(TOKEN)?.length ?? 0;
}

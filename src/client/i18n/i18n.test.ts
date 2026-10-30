import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ERROR_CODES, ERROR_CODES } from '../../shared/error-codes.ts';
import { ApiRequestError } from '../api/http.ts';
import { LOCALE_KEY, resolveInitialLocale, useLocaleStore } from '../stores/locale.ts';
import { MESSAGE_AREAS } from './areas.ts';
import { en, type MessageKey } from './en.ts';
import {
  apiErrorMessage,
  formatDate,
  formatDateTime,
  formatNumber,
  formatWords,
  t,
  translate,
} from './index.ts';
import { zhCN } from './zh-CN.ts';

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

const keys = Object.keys(en) as MessageKey[];

describe('dictionaries (I18N-09)', () => {
  it('has a non-empty zh-CN value for every en key, and no extra keys', () => {
    expect(Object.keys(zhCN).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(en[key].trim(), `en ${key}`).not.toBe('');
      expect(zhCN[key].trim(), `zh-CN ${key}`).not.toBe('');
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    for (const key of keys) {
      expect(placeholders(zhCN[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('defines no key twice across the message files', () => {
    const seen = new Map<string, string>();
    for (const [area, module] of Object.entries(MESSAGE_AREAS)) {
      for (const key of Object.keys(module.en)) {
        expect(seen.get(key), `${key} is in ${seen.get(key)} and ${area}`).toBeUndefined();
        seen.set(key, area);
      }
    }
  });

  it('has .one and .other together, each with {count}', () => {
    for (const key of keys) {
      const match = /^(.*)\.(one|other)$/.exec(key);
      if (!match) continue;
      const sibling = `${match[1]}.${match[2] === 'one' ? 'other' : 'one'}` as MessageKey;
      expect(keys, `${key} needs ${sibling}`).toContain(sibling);
      expect(placeholders(en[key]), key).toContain('count');
      expect(placeholders(zhCN[key]), key).toContain('count');
    }
  });

  it('has a translation of every API error code in both languages', () => {
    for (const code of [...ERROR_CODES, ...CLIENT_ERROR_CODES]) {
      const key = `errors.${code}` as MessageKey;
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(zhCN[key], `zh-CN ${key}`).toBeTruthy();
    }
  });
});

describe('translate', () => {
  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(translate('en', 'app.health.ok', { data: 'dev data' })).toBe('Server OK · dev data');
    expect(translate('zh-CN', 'app.health.ok', { data: '开发数据' })).toBe('服务器正常 · 开发数据');
    expect(translate('en', 'app.health.ok')).toBe('Server OK · {data}');
  });

  it('picks plural variants with Intl.PluralRules and groups the count', () => {
    expect(translate('en', 'words', { count: 1 })).toBe('1 word');
    expect(translate('en', 'words', { count: 0 })).toBe('0 words');
    expect(translate('en', 'words', { count: 1234 })).toBe('1,234 words');
    expect(translate('zh-CN', 'words', { count: 1 })).toBe('1 字');
    expect(translate('zh-CN', 'words', { count: 1234 })).toBe('1,234 字');
  });

  it('falls back to English when a translation is empty', () => {
    const original = zhCN['common.cancel'];
    zhCN['common.cancel'] = '';
    try {
      expect(translate('zh-CN', 'common.cancel')).toBe('Cancel');
    } finally {
      zhCN['common.cancel'] = original;
    }
  });

  it('shows the key itself for an unknown key rather than failing', () => {
    expect(translate('en', 'no.such.key' as MessageKey)).toBe('no.such.key');
  });
});

describe('number, date and word formatting (I18N-03)', () => {
  it('formats words for each language', () => {
    expect(formatWords(1234, 'en')).toBe('1,234 words');
    expect(formatWords(1, 'en')).toBe('1 word');
    expect(formatWords(1234, 'zh-CN')).toBe('1,234 字');
    expect(formatWords(0, 'zh-CN')).toBe('0 字');
  });

  it('formats numbers and dates with the chosen language', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    const iso = '2026-10-30T12:00:00Z';
    expect(formatDate(iso, 'en')).toContain('2026');
    expect(formatDate(iso, 'zh-CN')).toMatch(/2026年10月/);
    expect(formatDateTime(iso, 'zh-CN')).toMatch(/2026年10月/);
    expect(formatDate(iso, 'en')).not.toBe(formatDate(iso, 'zh-CN'));
  });

  it('returns an empty string for an unreadable date', () => {
    expect(formatDate('not a date', 'en')).toBe('');
    expect(formatDateTime('not a date', 'zh-CN')).toBe('');
  });
});

describe('apiErrorMessage (I18N-04)', () => {
  it('translates by code', () => {
    const error = new ApiRequestError(409, 'BOOK_TRASHED', 'This book is in the trash.');
    expect(apiErrorMessage(error, 'en')).toBe('This book is in the trash.');
    expect(apiErrorMessage(error, 'zh-CN')).toBe('此作品在回收站中。');
  });

  it('adds the server detail for codes that carry one', () => {
    const error = new ApiRequestError(400, 'VALIDATION_ERROR', 'title: Title is required.');
    expect(apiErrorMessage(error, 'en')).toBe('title: Title is required.');
    expect(apiErrorMessage(error, 'zh-CN')).toBe('输入内容无效。 title: Title is required.');
  });

  it('falls back to the server message for an unknown code', () => {
    const error = new ApiRequestError(418, 'BREWING_COFFEE', 'The pot is a teapot.');
    expect(apiErrorMessage(error, 'zh-CN')).toBe('The pot is a teapot.');
  });

  it('translates client codes and plain errors', () => {
    expect(apiErrorMessage(new ApiRequestError(0, 'NETWORK', 'x'), 'zh-CN')).toBe(
      '无法连接到 NovelStudio 服务器。',
    );
    expect(apiErrorMessage(new ApiRequestError(502, 'UNKNOWN', 'x'), 'en')).toBe(
      'Request failed (502).',
    );
    expect(apiErrorMessage(new Error('disk full'), 'zh-CN')).toBe('disk full');
    expect(apiErrorMessage('boom', 'zh-CN')).toBe('出了点问题。');
  });
});

describe('first-start language (I18N-02)', () => {
  it('follows the browser language when nothing is stored', () => {
    expect(resolveInitialLocale(null, 'zh-CN')).toBe('zh-CN');
    expect(resolveInitialLocale(undefined, 'zh-TW')).toBe('zh-CN');
    expect(resolveInitialLocale(null, 'zh')).toBe('zh-CN');
    expect(resolveInitialLocale(null, 'en-US')).toBe('en');
    expect(resolveInitialLocale(null, 'fr')).toBe('en');
    expect(resolveInitialLocale(null, undefined)).toBe('en');
  });

  it('prefers a stored choice, and treats an unreadable stored value as unset', () => {
    expect(resolveInitialLocale('en', 'zh-CN')).toBe('en');
    expect(resolveInitialLocale('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveInitialLocale('klingon', 'zh-CN')).toBe('zh-CN');
    expect(resolveInitialLocale('', 'en-US')).toBe('en');
  });
});

describe('locale store (I18N-02, I18N-08)', () => {
  const stored = new Map<string, string>();
  const documentElement = { lang: '' };
  const fakeDocument = { documentElement, title: '' };

  beforeEach(() => {
    stored.clear();
    documentElement.lang = '';
    fakeDocument.title = '';
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    });
    vi.stubGlobal('document', fakeDocument);
  });
  afterEach(() => {
    useLocaleStore.getState().setLocale('en');
    vi.unstubAllGlobals();
  });

  it('remembers the choice, sets <html lang> and the page title, and changes t()', () => {
    useLocaleStore.getState().setLocale('zh-CN');
    expect(stored.get(LOCALE_KEY)).toBe('zh-CN');
    expect(documentElement.lang).toBe('zh-CN');
    expect(fakeDocument.title).toBe('NovelStudio');
    expect(t('common.cancel')).toBe('取消');
    useLocaleStore.getState().setLocale('en');
    expect(documentElement.lang).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
  });

  it('still switches when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => useLocaleStore.getState().setLocale('zh-CN')).not.toThrow();
    expect(useLocaleStore.getState().locale).toBe('zh-CN');
  });
});

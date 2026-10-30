import { useCallback } from 'react';
import {
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  ERROR_CODES_WITH_DETAIL,
} from '../../shared/error-codes.ts';
import { DEFAULT_LOCALE, type Locale } from '../../shared/schemas/locale.ts';
import { ApiRequestError } from '../api/http.ts';
import { useLocaleStore } from '../stores/locale.ts';
import { en, type MessageKey } from './en.ts';
import { zhCN } from './zh-CN.ts';

export type { MessageKey } from './en.ts';

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, 'zh-CN': zhCN };

/** `'words'` for `'words.one'` / `'words.other'`: a key that is chosen by `params.count`. */
type PluralBase<K extends string> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;
export type MessageParams = Record<string, string | number>;

function isMessageKey(key: string): key is MessageKey {
  return key in en;
}

/** Number params are shown as given; use `formatNumber` first where grouping is wanted (`count` is grouped here). */
function fill(template: string, params: MessageParams | undefined, locale: Locale): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' && name === 'count'
      ? formatNumber(value, locale)
      : String(value);
  });
}

/**
 * Looks up a message. With a numeric `count` param, a key that has `.one` / `.other` variants picks
 * one with `Intl.PluralRules`. A key missing in the chosen language falls back to English.
 */
export function translate(
  locale: Locale,
  key: MessageKey | PluralKey,
  params?: MessageParams,
): string {
  const dictionary = DICTIONARIES[locale];
  let resolved: string = key;
  const count = params?.count;
  if (typeof count === 'number') {
    const variant = `${key}.${new Intl.PluralRules(locale).select(count)}`;
    const other = `${key}.other`;
    if (isMessageKey(variant)) resolved = variant;
    else if (isMessageKey(other)) resolved = other;
  }
  const template = isMessageKey(resolved)
    ? ((dictionary[resolved] || en[resolved]) as string)
    : resolved;
  return fill(template, params, locale);
}

export function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

/** The current language, for code outside React (notices, `confirm()` text). Components use `useT`. */
export function t(key: MessageKey | PluralKey, params?: MessageParams): string {
  return translate(currentLocale(), key, params);
}

export type TFunction = typeof t;

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale);
}

/** Re-renders the component when the language changes. The returned function changes with it. */
export function useT(): TFunction {
  const locale = useLocale();
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function formatNumber(value: number, locale: Locale = currentLocale()): string {
  let format = numberFormats.get(locale);
  if (!format) numberFormats.set(locale, (format = new Intl.NumberFormat(locale)));
  return format.format(value);
}

function dateFormat(locale: Locale, withTime: boolean): Intl.DateTimeFormat {
  const id = `${locale}:${withTime ? 'dt' : 'd'}`;
  let format = dateFormats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat(
      locale,
      withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
    );
    dateFormats.set(id, format);
  }
  return format;
}

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** An empty string for an unreadable date, so a bad value never shows as "Invalid Date". */
export function formatDate(
  value: string | number | Date,
  locale: Locale = currentLocale(),
): string {
  const date = toDate(value);
  return date ? dateFormat(locale, false).format(date) : '';
}

export function formatDateTime(
  value: string | number | Date,
  locale: Locale = currentLocale(),
): string {
  const date = toDate(value);
  return date ? dateFormat(locale, true).format(date) : '';
}

/** I18N-03: `1,234 words` / `1,234 字`. */
export function formatWords(count: number, locale: Locale = currentLocale()): string {
  return translate(locale, 'words', { count });
}

const isKnownCode = (code: string): boolean =>
  (ERROR_CODES as readonly string[]).includes(code) ||
  (CLIENT_ERROR_CODES as readonly string[]).includes(code);

/**
 * I18N-04: the message for a failed request, translated by its error `code`. A code without a
 * translation shows the server's own message; codes that carry details add the server's text.
 */
export function apiErrorMessage(error: unknown, locale: Locale = currentLocale()): string {
  if (error instanceof ApiRequestError) {
    if (!isKnownCode(error.code)) return error.message;
    const key = `errors.${error.code}` as MessageKey;
    if (!isMessageKey(key)) return error.message;
    const sentence = translate(locale, key, { status: error.status });
    if (ERROR_CODES_WITH_DETAIL.has(error.code) && error.message.trim() !== '') {
      return locale === DEFAULT_LOCALE ? error.message : `${sentence} ${error.message}`;
    }
    return sentence;
  }
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return translate(locale, 'common.somethingWentWrong');
}

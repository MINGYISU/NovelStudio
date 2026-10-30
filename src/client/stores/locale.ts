import { create } from 'zustand';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '../../shared/schemas/locale.ts';
import { en } from '../i18n/en.ts';

export const LOCALE_KEY = 'novelstudio:locale';

/** I18N-02: a stored choice wins; otherwise a browser language starting with `zh` means 简体中文. */
export function resolveInitialLocale(
  stored: string | null | undefined,
  browserLanguage: string | null | undefined,
): Locale {
  const parsed = localeSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  return typeof browserLanguage === 'string' && /^zh/i.test(browserLanguage)
    ? 'zh-CN'
    : DEFAULT_LOCALE;
}

function readInitialLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_KEY);
  } catch {
    // An unreadable value counts as unset.
  }
  const language = typeof navigator === 'undefined' ? null : navigator.language;
  return resolveInitialLocale(stored, language);
}

/** I18N-08: the page language drives the glyph forms of Chinese text. */
function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = en['app.name'];
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => {
  const initial = readInitialLocale();
  applyLocale(initial);
  return {
    locale: initial,
    setLocale: (locale) => {
      try {
        localStorage.setItem(LOCALE_KEY, locale);
      } catch {
        // The choice is a convenience only; ignore storage failures.
      }
      applyLocale(locale);
      set({ locale });
    },
  };
});

import { LOCALES } from '../../../shared/schemas/locale.ts';
import { useT } from '../../i18n/index.ts';
import { useLocaleStore } from '../../stores/locale.ts';
import styles from './settings.module.css';

/** I18N-02: the interface language. The heading is always in both languages. */
export function LanguageSection() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return (
    <section className={styles.section} aria-labelledby="language-heading">
      <h2 id="language-heading">{t('language.title')}</h2>
      <div className={styles.choice} role="radiogroup" aria-labelledby="language-heading">
        {LOCALES.map((option) => (
          <label key={option} className={styles.choice}>
            <input
              type="radio"
              name="interface-language"
              checked={locale === option}
              onChange={() => setLocale(option)}
            />{' '}
            {t(`language.${option}`)}
          </label>
        ))}
      </div>
    </section>
  );
}

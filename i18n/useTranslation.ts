import { useCallback } from 'react';
import { useStore } from '../store';
import { translations, Locale } from './translations';

type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? { [K in keyof T & string]: NestedKeyOf<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`> }[keyof T & string]
  : Prefix;

type TranslationKey = NestedKeyOf<typeof translations['en']>;

function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? path;
}

/**
 * Returns a `t(key, params?)` function that resolves translation strings
 * based on the current language from userSettings.
 *
 * Usage:
 *   const { t, locale } = useTranslation();
 *   t('nav.input')              // "Input" or "Įvedimas"
 *   t('hydration.dbWakingDesc', { count: 3 })  // interpolates {count}
 */
export function useTranslation() {
  const locale: Locale = useStore((s) => s.userSettings?.language ?? 'en') as Locale;
  const dict = translations[locale] ?? translations.en;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = getNestedValue(dict, key);
      if (typeof value !== 'string') return key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return value;
    },
    [dict],
  );

  return { t, locale };
}

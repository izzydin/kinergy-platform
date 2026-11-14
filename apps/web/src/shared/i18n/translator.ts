import { en, type TranslationDictionary } from './locales/en';
import { es } from './locales/es';
import { ES_PHRASE_MAP } from './phrase-map';
import type { NestedTranslationDictionary, SupportedLocale, TranslationParams } from './types';

export const TRANSLATION_DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  en,
  es,
};

export function getDictionaryValue(
  dictionary: NestedTranslationDictionary,
  dotPath: string,
): string | undefined {
  if (!dotPath) return undefined;
  const parts = dotPath.split('.');
  let current: string | NestedTranslationDictionary | undefined = dictionary;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

export function interpolateTemplate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const val = params[token];
    if (val === undefined || val === null) {
      return match;
    }
    return String(val);
  });
}

/**
 * Resolves a translation key or phrase in the requested `locale`, falling back cleanly to:
 * 1. Target locale dictionary (`es` or `en`)
 * 2. Target locale phrase map (if `locale === 'es'`)
 * 3. English dictionary (`en`)
 * 4. Explicit `fallback` argument (or translated fallback if `locale === 'es'` and fallback is in phrase map)
 * 5. Raw `key`
 */
export function translate(
  locale: SupportedLocale,
  key: string,
  fallbackOrParams?: string | TranslationParams,
  maybeParams?: TranslationParams,
): string {
  const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
  const params =
    typeof fallbackOrParams === 'object' && fallbackOrParams !== null
      ? fallbackOrParams
      : maybeParams;

  const activeDict = (TRANSLATION_DICTIONARIES[locale] ??
    en) as unknown as NestedTranslationDictionary;
  const englishDict = en as unknown as NestedTranslationDictionary;

  // 1. Direct dot-path lookup in active locale dictionary
  const activeValue = getDictionaryValue(activeDict, key);
  if (activeValue !== undefined) {
    return interpolateTemplate(activeValue, params);
  }

  // 2. If Spanish, check phrase map for exact match on key or fallback
  if (locale === 'es') {
    const mappedByKey = ES_PHRASE_MAP[key];
    if (mappedByKey !== undefined) {
      return interpolateTemplate(mappedByKey, params);
    }
    if (fallback) {
      const mappedByFallback = ES_PHRASE_MAP[fallback];
      if (mappedByFallback !== undefined) {
        return interpolateTemplate(mappedByFallback, params);
      }
    }
  }

  // 3. Fallback to English dictionary
  const englishValue = getDictionaryValue(englishDict, key);
  if (englishValue !== undefined) {
    return interpolateTemplate(englishValue, params);
  }

  // 4. Fallback to provided fallback string or raw key
  return interpolateTemplate(fallback ?? key, params);
}

/**
 * Recursively extracts all leaf dot-paths from a nested translation dictionary.
 * Used by automated i18n parity tests to enforce 100% key coverage between `en` and `es`.
 */
export function flattenTranslationKeys(obj: NestedTranslationDictionary, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      keys.push(...flattenTranslationKeys(v, nextKey));
    } else {
      keys.push(nextKey);
    }
  }
  return keys;
}

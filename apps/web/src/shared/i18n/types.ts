export type SupportedLocale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'es'] as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export interface LanguageOption {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  bcp47: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    bcp47: 'en-US',
  },
  {
    code: 'es',
    label: 'Spanish (Latin America)',
    nativeLabel: 'Español',
    bcp47: 'es-419',
  },
] as const;

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export interface NestedTranslationDictionary {
  [key: string]: string | NestedTranslationDictionary;
}

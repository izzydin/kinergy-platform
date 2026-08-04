import React, { createContext, useContext, useState } from 'react';

export type SupportedLocale = 'en' | 'es' | 'de' | 'fr';

export interface LocaleContextState {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, fallback?: string) => string;
}

const LocaleContext = createContext<LocaleContextState | undefined>(undefined);

export interface LocaleProviderProps {
  children: React.ReactNode;
  defaultLocale?: SupportedLocale;
}

/**
 * Localization Provider Placeholder Component
 *
 * Infrastructure placeholder for future i18n multi-language support.
 */
export const LocaleProvider: React.FC<LocaleProviderProps> = ({
  children,
  defaultLocale = 'en',
}) => {
  const [locale, setLocale] = useState<SupportedLocale>(defaultLocale);

  const t = (key: string, fallback?: string): string => {
    // Placeholder translation function
    return fallback || key;
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
  );
};

export const useLocale = (): LocaleContextState => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};

export const useTranslation = (): LocaleContextState => {
  return useLocale();
};

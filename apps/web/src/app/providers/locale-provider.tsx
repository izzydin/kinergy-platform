import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOptionalAuth } from './auth-provider';
import {
  DEFAULT_LOCALE,
  LANGUAGE_OPTIONS,
  SUPPORTED_LOCALES,
  type LanguageOption,
  type SupportedLocale,
  type TranslationParams,
} from '../../shared/i18n/types';
import { translate } from '../../shared/i18n/translator';
import {
  formatLocaleCurrency,
  formatLocaleCurrencyCents,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleNumber,
  formatLocalePercent,
  formatLocaleTime,
} from '../../shared/i18n/formatters';
import { translateApiError } from '../../shared/i18n/error-translator';
import {
  clearActiveEmployeeLocaleSession,
  getActiveSessionLocaleRecord,
  getUnauthenticatedSessionLocale,
  isValidSupportedLocale,
  resolveEmployeeLocale,
  saveEmployeeLocalePreference,
  setUnauthenticatedSessionLocale,
  syncActiveEmployeeLocaleSession,
} from '../../shared/i18n/preference-storage';

export type { SupportedLocale, TranslationParams, LanguageOption };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LANGUAGE_OPTIONS };

export interface LocaleContextState {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  availableLocales: readonly LanguageOption[];
  t: (
    key: string,
    fallbackOrParams?: string | TranslationParams,
    params?: TranslationParams,
  ) => string;
  translateError: (error: unknown, fallbackMessage?: string) => string;
  formatDate: (
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatTime: (
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatDateTime: (
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (
    value: number | null | undefined,
    options?: Intl.NumberFormatOptions & { isRatio?: boolean },
  ) => string;
  formatCurrency: (amount: number | null | undefined, currency?: string) => string;
  formatCurrencyCents: (cents: number | null | undefined, currency?: string) => string;
}

const defaultEnglishT = (
  key: string,
  fallbackOrParams?: string | TranslationParams,
  params?: TranslationParams,
): string => translate('en', key, fallbackOrParams, params);

const DEFAULT_CONTEXT_VALUE: LocaleContextState = {
  locale: 'en',
  setLocale: () => undefined,
  availableLocales: LANGUAGE_OPTIONS,
  t: defaultEnglishT,
  translateError: (error: unknown, fallbackMessage?: string) =>
    translateApiError(error, defaultEnglishT, fallbackMessage),
  formatDate: (value, options) => formatLocaleDate(value, 'en', options),
  formatTime: (value, options) => formatLocaleTime(value, 'en', options),
  formatDateTime: (value, options) => formatLocaleDateTime(value, 'en', options),
  formatNumber: (value, options) => formatLocaleNumber(value, 'en', options),
  formatPercent: (value, options) => formatLocalePercent(value, 'en', options),
  formatCurrency: (amount, currency) => formatLocaleCurrency(amount, currency, 'en'),
  formatCurrencyCents: (cents, currency) => formatLocaleCurrencyCents(cents, currency, 'en'),
};

const LocaleContext = createContext<LocaleContextState>(DEFAULT_CONTEXT_VALUE);
LocaleContext.displayName = 'LocaleContext';

export interface LocaleProviderProps {
  children: React.ReactNode;
  defaultLocale?: SupportedLocale;
}

/**
 * Application-Wide Localization Provider (`en` & `es` — Latin American Spanish)
 *
 * Responsibilities:
 * - Resolves and persists language preference per authenticated employee (`userId` / `email`)
 * - Restores active employee preference across page navigation, browser refresh, and login/logout cycles
 * - Isolates preferences between different employee accounts
 * - Defaults employees without a saved preference to `'en'` (English)
 * - Exposes `t()`, `translateError()`, and locale-aware `Intl` formatters
 */
export const LocaleProvider: React.FC<LocaleProviderProps> = ({
  children,
  defaultLocale = DEFAULT_LOCALE,
}) => {
  const auth = useOptionalAuth();
  const currentUser = auth?.currentUser ?? null;

  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (currentUser) {
      return resolveEmployeeLocale(currentUser.id, currentUser.email, defaultLocale);
    }
    const activeSession = getActiveSessionLocaleRecord();
    if (activeSession) {
      return activeSession.locale;
    }
    const unauthLocale = getUnauthenticatedSessionLocale();
    if (unauthLocale) {
      return unauthLocale;
    }
    return isValidSupportedLocale(defaultLocale) ? defaultLocale : DEFAULT_LOCALE;
  });

  const previousUserKeyRef = useRef<string | null>(
    currentUser ? `${currentUser.id}::${currentUser.email}` : null,
  );

  useEffect(() => {
    const currentUserKey = currentUser ? `${currentUser.id}::${currentUser.email}` : null;
    const prevUserKey = previousUserKeyRef.current;

    if (currentUserKey && currentUser) {
      const resolved = resolveEmployeeLocale(currentUser.id, currentUser.email, defaultLocale);
      setLocaleState(resolved);
      syncActiveEmployeeLocaleSession(resolved, currentUser.id, currentUser.email);
    } else if (prevUserKey !== null && currentUserKey === null) {
      // Employee logged out: clear session cache and reset to default English
      clearActiveEmployeeLocaleSession();
      setLocaleState(defaultLocale);
    }

    previousUserKeyRef.current = currentUserKey;
  }, [currentUser, defaultLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: SupportedLocale) => {
      if (!isValidSupportedLocale(nextLocale)) return;
      setLocaleState(nextLocale);

      if (currentUser) {
        saveEmployeeLocalePreference(nextLocale, currentUser.id, currentUser.email);
      } else {
        setUnauthenticatedSessionLocale(nextLocale);
      }
    },
    [currentUser],
  );

  const t = useCallback(
    (
      key: string,
      fallbackOrParams?: string | TranslationParams,
      params?: TranslationParams,
    ): string => translate(locale, key, fallbackOrParams, params),
    [locale],
  );

  const translateError = useCallback(
    (error: unknown, fallbackMessage?: string): string =>
      translateApiError(error, t, fallbackMessage),
    [t],
  );

  const formatDate = useCallback(
    (
      value: Date | string | number | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ): string => formatLocaleDate(value, locale, options),
    [locale],
  );

  const formatTime = useCallback(
    (
      value: Date | string | number | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ): string => formatLocaleTime(value, locale, options),
    [locale],
  );

  const formatDateTime = useCallback(
    (
      value: Date | string | number | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ): string => formatLocaleDateTime(value, locale, options),
    [locale],
  );

  const formatNumber = useCallback(
    (value: number | null | undefined, options?: Intl.NumberFormatOptions): string =>
      formatLocaleNumber(value, locale, options),
    [locale],
  );

  const formatPercent = useCallback(
    (
      value: number | null | undefined,
      options?: Intl.NumberFormatOptions & { isRatio?: boolean },
    ): string => formatLocalePercent(value, locale, options),
    [locale],
  );

  const formatCurrency = useCallback(
    (amount: number | null | undefined, currency = 'USD'): string =>
      formatLocaleCurrency(amount, currency, locale),
    [locale],
  );

  const formatCurrencyCents = useCallback(
    (cents: number | null | undefined, currency = 'USD'): string =>
      formatLocaleCurrencyCents(cents, currency, locale),
    [locale],
  );

  const contextValue = useMemo<LocaleContextState>(
    () => ({
      locale,
      setLocale,
      availableLocales: LANGUAGE_OPTIONS,
      t,
      translateError,
      formatDate,
      formatTime,
      formatDateTime,
      formatNumber,
      formatPercent,
      formatCurrency,
      formatCurrencyCents,
    }),
    [
      locale,
      setLocale,
      t,
      translateError,
      formatDate,
      formatTime,
      formatDateTime,
      formatNumber,
      formatPercent,
      formatCurrency,
      formatCurrencyCents,
    ],
  );

  return <LocaleContext.Provider value={contextValue}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextState => {
  return useContext(LocaleContext);
};

export const useTranslation = (): LocaleContextState => {
  return useContext(LocaleContext);
};

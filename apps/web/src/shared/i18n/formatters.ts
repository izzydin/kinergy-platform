import type { SupportedLocale } from './types';

export function getBcp47Locale(locale: SupportedLocale): string {
  return locale === 'es' ? 'es-419' : 'en-US';
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toDateInstance(value: Date | string | number | null | undefined): {
  date: Date | null;
  isDateOnly: boolean;
} {
  if (value === null || value === undefined || value === '') {
    return { date: null, isDateOnly: false };
  }
  if (value instanceof Date) {
    return {
      date: Number.isNaN(value.getTime()) ? null : value,
      isDateOnly: false,
    };
  }
  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value.trim())) {
    const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
    return {
      date: Number.isNaN(parsed.getTime()) ? null : parsed,
      isDateOnly: true,
    };
  }
  const parsed = new Date(value);
  return {
    date: Number.isNaN(parsed.getTime()) ? null : parsed,
    isDateOnly: false,
  };
}

export function formatLocaleDate(
  value: Date | string | number | null | undefined,
  locale: SupportedLocale = 'en',
  options?: Intl.DateTimeFormatOptions,
): string {
  const { date, isDateOnly } = toDateInstance(value);
  if (!date) return '—';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    ...(options && Object.keys(options).some((k) => k !== 'timeZone')
      ? {}
      : { year: 'numeric', month: 'short', day: 'numeric' }),
    ...(isDateOnly && !options?.timeZone ? { timeZone: 'UTC' } : {}),
    ...options,
  };

  return new Intl.DateTimeFormat(getBcp47Locale(locale), defaultOptions).format(date);
}

export function formatLocaleTime(
  value: Date | string | number | null | undefined,
  locale: SupportedLocale = 'en',
  options?: Intl.DateTimeFormatOptions,
): string {
  const { date } = toDateInstance(value);
  if (!date) return '—';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat(getBcp47Locale(locale), defaultOptions).format(date);
}

export function formatLocaleDateTime(
  value: Date | string | number | null | undefined,
  locale: SupportedLocale = 'en',
  options?: Intl.DateTimeFormatOptions,
): string {
  const { date } = toDateInstance(value);
  if (!date) return '—';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat(getBcp47Locale(locale), defaultOptions).format(date);
}

export function formatLocaleNumber(
  value: number | null | undefined,
  locale: SupportedLocale = 'en',
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat(getBcp47Locale(locale), options).format(value);
}

export function formatLocalePercent(
  value: number | null | undefined,
  locale: SupportedLocale = 'en',
  options?: Intl.NumberFormatOptions & { isRatio?: boolean },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '0%';
  }
  const { isRatio = false, ...intlOptions } = options ?? {};
  const ratio = isRatio ? value : value / 100;
  return new Intl.NumberFormat(getBcp47Locale(locale), {
    style: 'percent',
    maximumFractionDigits: 1,
    ...intlOptions,
  }).format(ratio);
}

/**
 * Formats a major-unit monetary amount (e.g. 25.50) according to the active locale
 * while strictly preserving the currency code (default USD) and exact monetary value.
 */
export function formatLocaleCurrency(
  amount: number | null | undefined,
  currency = 'USD',
  locale: SupportedLocale = 'en',
): string {
  const safeAmount =
    amount !== null && amount !== undefined && Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = (currency || 'USD').trim().toUpperCase();

  try {
    return new Intl.NumberFormat(getBcp47Locale(locale), {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `$${safeAmount.toFixed(2)} ${normalizedCurrency}`;
  }
}

/**
 * Formats minor-unit integer cents (e.g. 2550 -> $25.50) without altering financial math.
 */
export function formatLocaleCurrencyCents(
  cents: number | null | undefined,
  currency = 'USD',
  locale: SupportedLocale = 'en',
): string {
  const safeCents =
    cents !== null && cents !== undefined && Number.isFinite(cents) ? Math.round(cents) : 0;
  return formatLocaleCurrency(safeCents / 100, currency, locale);
}

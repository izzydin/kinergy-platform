import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './types';

const USER_ID_KEY_PREFIX = 'kinergy.locale.user.';
const USER_EMAIL_KEY_PREFIX = 'kinergy.locale.email.';
const ACTIVE_SESSION_KEY = 'kinergy.locale.session';
const UNAUTH_SESSION_KEY = 'kinergy.locale.unauth';

export interface ActiveLocaleSessionRecord {
  userId: string;
  email: string;
  locale: SupportedLocale;
}

export function isValidSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or security restrictions in sandboxed environments
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

function safeGetSessionStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore
  }
}

function safeRemoveSessionStorage(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Retrieves the saved locale preference for a specific employee by ID or email.
 * Returns `null` if the employee has never saved a language preference.
 */
export function getStoredEmployeeLocale(
  userId?: string | null,
  email?: string | null,
): SupportedLocale | null {
  if (userId) {
    const byId = safeGetLocalStorage(`${USER_ID_KEY_PREFIX}${userId}`);
    if (isValidSupportedLocale(byId)) {
      return byId;
    }
  }
  if (email) {
    const normalized = normalizeEmail(email);
    const byEmail = safeGetLocalStorage(`${USER_EMAIL_KEY_PREFIX}${normalized}`);
    if (isValidSupportedLocale(byEmail)) {
      return byEmail;
    }
  }
  return null;
}

/**
 * Resolves the effective locale for an authenticated employee, defaulting to `'en'`
 * when the employee has no saved preference.
 */
export function resolveEmployeeLocale(
  userId?: string | null,
  email?: string | null,
  fallbackLocale: SupportedLocale = DEFAULT_LOCALE,
): SupportedLocale {
  return getStoredEmployeeLocale(userId, email) ?? fallbackLocale;
}

/**
 * Persists an authenticated employee's language preference under both their user ID and email,
 * and updates the active session cache for instant restoration on browser refresh.
 */
export function saveEmployeeLocalePreference(
  locale: SupportedLocale,
  userId?: string | null,
  email?: string | null,
): void {
  if (!isValidSupportedLocale(locale)) return;

  if (userId) {
    safeSetLocalStorage(`${USER_ID_KEY_PREFIX}${userId}`, locale);
  }
  if (email) {
    const normalized = normalizeEmail(email);
    safeSetLocalStorage(`${USER_EMAIL_KEY_PREFIX}${normalized}`, locale);
  }
  if (userId || email) {
    const record: ActiveLocaleSessionRecord = {
      userId: userId ?? '',
      email: email ? normalizeEmail(email) : '',
      locale,
    };
    safeSetLocalStorage(ACTIVE_SESSION_KEY, JSON.stringify(record));
  }
}

/**
 * Updates the active session record when an authenticated employee session is established,
 * ensuring browser refreshes synchronously initialize to that employee's locale.
 */
export function syncActiveEmployeeLocaleSession(
  locale: SupportedLocale,
  userId: string,
  email: string,
): void {
  const record: ActiveLocaleSessionRecord = {
    userId,
    email: normalizeEmail(email),
    locale,
  };
  safeSetLocalStorage(ACTIVE_SESSION_KEY, JSON.stringify(record));
}

/**
 * Reads the active session locale cache (used during initial mount before `/auth/me` resolves).
 */
export function getActiveSessionLocaleRecord(): ActiveLocaleSessionRecord | null {
  const raw = safeGetLocalStorage(ACTIVE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveLocaleSessionRecord>;
    if (isValidSupportedLocale(parsed?.locale)) {
      return {
        userId: typeof parsed.userId === 'string' ? parsed.userId : '',
        email: typeof parsed.email === 'string' ? parsed.email : '',
        locale: parsed.locale,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clears the active session locale cache on logout so a subsequent user never inherits
 * the previous employee's language state.
 */
export function clearActiveEmployeeLocaleSession(): void {
  safeRemoveLocalStorage(ACTIVE_SESSION_KEY);
  safeRemoveSessionStorage(UNAUTH_SESSION_KEY);
}

/**
 * Stores or retrieves temporary unauthenticated session language (e.g. on `/login`).
 */
export function getUnauthenticatedSessionLocale(): SupportedLocale | null {
  const val = safeGetSessionStorage(UNAUTH_SESSION_KEY);
  return isValidSupportedLocale(val) ? val : null;
}

export function setUnauthenticatedSessionLocale(locale: SupportedLocale): void {
  if (!isValidSupportedLocale(locale)) return;
  safeSetSessionStorage(UNAUTH_SESSION_KEY, locale);
}

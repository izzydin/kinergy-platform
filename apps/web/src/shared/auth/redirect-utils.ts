/**
 * Open Redirect Security & Return Destination Sanitization Utilities
 *
 * Implements CWE-601 Open Redirect vulnerability protection, URL normalization,
 * return-destination path/query/hash preservation, and redirect loop prevention.
 */

/**
 * Validates whether a raw path string is a safe, internal relative application destination.
 *
 * Security Rules:
 * 1. Must start with a single forward slash `/`.
 * 2. Must NOT start with `//` or `/\\` (scheme-relative / protocol-relative URL exploits).
 * 3. Must NOT contain absolute URI schemes (`https:`, `http:`, `javascript:`, `data:`, `vbscript:`).
 * 4. Must NOT contain control or line-feed injection characters (`\r`, `\n`).
 */
export function isSafeInternalRedirect(rawPath: string | null | undefined): boolean {
  if (!rawPath) return false;
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) return false;

  // Reject CRLF / header injection characters
  if (/[\r\n]/.test(trimmed)) return false;

  // Must start with '/' and MUST NOT start with '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return false;
  }

  // Reject absolute URL schemes or script protocols
  if (/^(?:[a-z0-9+.-]+:|\/\/)/i.test(trimmed) || /^(?:javascript|data|vbscript):/i.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Sanitizes and resolves a post-authentication return path parameter.
 *
 * @param rawPath Raw query parameter string (e.g. `?redirect=/clients?page=2#top`)
 * @param fallbackPath Default authenticated dashboard target if redirect is unsafe or empty (default `/dashboard`)
 */
export function sanitizeRedirectPath(
  rawPath: string | null | undefined,
  fallbackPath = '/dashboard',
): string {
  if (!rawPath) return fallbackPath;

  const trimmed = rawPath.trim();
  if (trimmed.length === 0) return fallbackPath;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // If malformed URI encoding, use raw trimmed value
  }

  if (!isSafeInternalRedirect(decoded)) {
    return fallbackPath;
  }

  // Redirect Loop Prevention: Authenticated users must never be redirected into /auth/* routes
  const cleanPath = (decoded.split('?')[0] ?? '').split('#')[0] ?? '';
  if (cleanPath.startsWith('/auth')) {
    return fallbackPath;
  }

  return decoded;
}

/**
 * Constructs a safe redirect URL for unauthenticated users navigating to protected routes.
 * Preserves pathname, search query parameters, and hash fragment.
 *
 * @param location Current router location object ({ pathname, search, hash })
 * @param fallbackRedirectPath Base login route path (default `/auth/login`)
 */
export function createAuthRedirectUrl(
  location: { pathname: string; search: string; hash?: string },
  fallbackRedirectPath = '/auth/login',
): string {
  const isAlreadyAuthRoute = location.pathname.startsWith('/auth');
  if (isAlreadyAuthRoute) {
    return fallbackRedirectPath;
  }

  const fullPath = location.pathname + location.search + (location.hash || '');
  return `${fallbackRedirectPath}?redirect=${encodeURIComponent(fullPath)}`;
}

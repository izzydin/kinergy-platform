/**
 * Track B — Step B3.3: Safe Authentication Redirect Utilities Test Suite
 *
 * Validates CWE-601 Open Redirect protection, URL normalization,
 * pathname/query/hash preservation, and redirect loop prevention.
 */
import {
  createAuthRedirectUrl,
  isSafeInternalRedirect,
  sanitizeRedirectPath,
} from '../redirect-utils';

describe('Track B — Step B3.3: Safe Authentication Redirect Utilities', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. isSafeInternalRedirect Validation Engine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. isSafeInternalRedirect', () => {
    it('accepts simple internal relative path (/clients)', () => {
      expect(isSafeInternalRedirect('/clients')).toBe(true);
    });

    it('accepts internal relative path with query parameters (/clients?page=2&status=active)', () => {
      expect(isSafeInternalRedirect('/clients?page=2&status=active')).toBe(true);
    });

    it('accepts internal relative path with query parameters and hash fragment (/clients?page=2#section2)', () => {
      expect(isSafeInternalRedirect('/clients?page=2#section2')).toBe(true);
    });

    it('rejects null, undefined, empty, or whitespace-only inputs', () => {
      expect(isSafeInternalRedirect(null)).toBe(false);
      expect(isSafeInternalRedirect(undefined)).toBe(false);
      expect(isSafeInternalRedirect('')).toBe(false);
      expect(isSafeInternalRedirect('   ')).toBe(false);
    });

    it('rejects absolute external HTTP/HTTPS URLs (https://evil.example)', () => {
      expect(isSafeInternalRedirect('https://evil.example')).toBe(false);
      expect(isSafeInternalRedirect('http://evil.example/clients')).toBe(false);
      expect(isSafeInternalRedirect('ftp://evil.example')).toBe(false);
    });

    it('rejects protocol-relative URLs (//evil.example)', () => {
      expect(isSafeInternalRedirect('//evil.example')).toBe(false);
      expect(isSafeInternalRedirect('//localhost')).toBe(false);
    });

    it('rejects slash-backslash scheme relative URLs (/\\evil.example)', () => {
      expect(isSafeInternalRedirect('/\\evil.example')).toBe(false);
    });

    it('rejects javascript: and data: script execution schemes', () => {
      expect(isSafeInternalRedirect('javascript:alert(1)')).toBe(false);
      expect(isSafeInternalRedirect('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeInternalRedirect('vbscript:msgbox(1)')).toBe(false);
    });

    it('rejects carriage-return or line-feed injection characters', () => {
      expect(isSafeInternalRedirect('/dashboard\r\nHeader: Value')).toBe(false);
      expect(isSafeInternalRedirect('/clients\nLocation: http://evil.com')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. sanitizeRedirectPath Sanitization & Fallback Resolution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. sanitizeRedirectPath', () => {
    it('returns default fallback (/dashboard) when input is null, undefined, or empty', () => {
      expect(sanitizeRedirectPath(null)).toBe('/dashboard');
      expect(sanitizeRedirectPath(undefined)).toBe('/dashboard');
      expect(sanitizeRedirectPath('')).toBe('/dashboard');
    });

    it('decodes encoded URI parameters (%2Fclients%3Fpage%3D2 -> /clients?page=2)', () => {
      const encoded = encodeURIComponent('/clients?page=2&status=active#section2');
      expect(sanitizeRedirectPath(encoded)).toBe('/clients?page=2&status=active#section2');
    });

    it('handles malformed URI components gracefully without throwing (%E0%A4%A)', () => {
      expect(sanitizeRedirectPath('%E0%A4%A')).toBe('/dashboard');
    });

    it('sanitizes external URLs to default fallback (/dashboard)', () => {
      expect(sanitizeRedirectPath('https://attacker.com/steal')).toBe('/dashboard');
      expect(sanitizeRedirectPath('//attacker.com')).toBe('/dashboard');
      expect(sanitizeRedirectPath('javascript:alert(1)')).toBe('/dashboard');
    });

    it('enforces redirect loop prevention by rejecting targets starting with /auth', () => {
      expect(sanitizeRedirectPath('/auth/login')).toBe('/dashboard');
      expect(sanitizeRedirectPath('/auth/reset-password')).toBe('/dashboard');
      expect(sanitizeRedirectPath('/auth/unauthenticated')).toBe('/dashboard');
    });

    it('respects custom fallback path parameter when specified', () => {
      expect(sanitizeRedirectPath('https://evil.com', '/overview')).toBe('/overview');
      expect(sanitizeRedirectPath('', '/overview')).toBe('/overview');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. createAuthRedirectUrl Location Encoding & Loop Suppression
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. createAuthRedirectUrl', () => {
    it('encodes full location (pathname, search query params, hash) into ?redirect= parameter', () => {
      const location = {
        pathname: '/clients/123',
        search: '?tab=settings&filter=active',
        hash: '#top',
      };

      const result = createAuthRedirectUrl(location);
      const expectedTarget = encodeURIComponent('/clients/123?tab=settings&filter=active#top');
      expect(result).toBe(`/auth/login?redirect=${expectedTarget}`);
    });

    it('suppresses ?redirect= query param when current location is already an /auth route', () => {
      const authLocation = {
        pathname: '/auth/login',
        search: '',
        hash: '',
      };

      expect(createAuthRedirectUrl(authLocation)).toBe('/auth/login');
    });

    it('respects custom login path parameter when provided', () => {
      const location = { pathname: '/energy', search: '' };
      expect(createAuthRedirectUrl(location, '/custom-login')).toBe(
        `/custom-login?redirect=${encodeURIComponent('/energy')}`,
      );
    });
  });
});

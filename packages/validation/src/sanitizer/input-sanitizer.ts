/**
 * Production-grade Input Sanitizer for API HTTP Payloads.
 * Trims excessive whitespace, strips control characters, and neutralizes XSS vectors.
 */
export class InputSanitizer {
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'currentpassword',
    'newpassword',
    'confirmpassword',
    'token',
    'refreshtoken',
    'accesstoken',
    'secret',
  ]);

  /**
   * Recursively sanitizes any payload value (objects, arrays, strings).
   */
  public static sanitize<T>(value: T, parentKey?: string): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return InputSanitizer.sanitizeString(value, parentKey) as unknown as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => InputSanitizer.sanitize(item, parentKey)) as unknown as T;
    }

    if (typeof value === 'object' && !(value instanceof Date)) {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        sanitizedObj[key] = InputSanitizer.sanitize(val, key);
      }
      return sanitizedObj as T;
    }

    return value;
  }

  /**
   * Sanitizes individual string values.
   */
  public static sanitizeString(str: string, key?: string): string {
    if (!str) {
      return str;
    }

    // 1. Strip ASCII control characters (\u0000-\u0008, \u000B-\u000C, \u000E-\u001F, \u007F-\u009F)
    // eslint-disable-next-line no-control-regex
    let sanitized = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

    // 2. Trim leading and trailing whitespace
    sanitized = sanitized.trim();

    // 3. Skip HTML/XSS neutralization for credential fields to preserve exact password characters
    if (key && InputSanitizer.SENSITIVE_KEYS.has(key.toLowerCase())) {
      return sanitized;
    }

    // 4. Neutralize common XSS vectors (<script>, javascript: URI, event attributes like onload=)
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript\s*:/gi, 'no-javascript:')
      .replace(/\bon\w+\s*=/gi, (match) => `disabled-${match}`);

    return sanitized;
  }
}

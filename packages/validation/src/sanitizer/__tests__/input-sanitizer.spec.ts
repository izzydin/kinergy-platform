import { InputSanitizer } from '../input-sanitizer';

describe('InputSanitizer Unit Tests', () => {
  describe('Whitespace Trimming', () => {
    it('should trim leading and trailing whitespace from string input', () => {
      const input = '   hello@example.com   ';
      expect(InputSanitizer.sanitize(input)).toBe('hello@example.com');
    });

    it('should trim whitespace recursively in object properties', () => {
      const input = {
        email: '   user@kinergy.local  ',
        profile: {
          name: '   John Doe   ',
        },
      };

      const result = InputSanitizer.sanitize(input);
      expect(result.email).toBe('user@kinergy.local');
      expect(result.profile.name).toBe('John Doe');
    });
  });

  describe('Control Character Stripping', () => {
    it('should strip null bytes and invisible control characters', () => {
      const input = 'malicious\u0000payload\u0007with\u001Fcontrol';
      const sanitized = InputSanitizer.sanitize(input);
      expect(sanitized).toBe('maliciouspayloadwithcontrol');
    });

    it('should preserve newlines and tabs where applicable', () => {
      const input = 'Line 1\nLine 2\tTabbed';
      const sanitized = InputSanitizer.sanitize(input);
      expect(sanitized).toBe('Line 1\nLine 2\tTabbed');
    });
  });

  describe('XSS Vector Neutralization', () => {
    it('should strip <script> tags from string input', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const sanitized = InputSanitizer.sanitize(input);
      expect(sanitized).toBe('Hello World');
    });

    it('should neutralize javascript: URIs', () => {
      const input = 'javascript:alert(1)';
      const sanitized = InputSanitizer.sanitize(input);
      expect(sanitized).toBe('no-javascript:alert(1)');
    });

    it('should disable event handler attributes like onload or onerror', () => {
      const input = 'img src="x" onload=alert(1) onerror=alert(2)';
      const sanitized = InputSanitizer.sanitize(input);
      expect(sanitized).toBe('img src="x" disabled-onload=alert(1) disabled-onerror=alert(2)');
    });
  });

  describe('Credential Exemption Safety', () => {
    it('should NOT alter special characters inside password fields', () => {
      const password = '   P@ssword<script>!   ';
      const sanitized = InputSanitizer.sanitize(password, 'password');
      expect(sanitized).toBe('P@ssword<script>!');
    });
  });

  describe('Primitive and Structural Preservation', () => {
    it('should preserve booleans, numbers, null, and undefined values', () => {
      const payload = {
        age: 30,
        isActive: true,
        score: 99.5,
        deletedAt: null,
        notes: undefined,
      };

      const sanitized = InputSanitizer.sanitize(payload);
      expect(sanitized.age).toBe(30);
      expect(sanitized.isActive).toBe(true);
      expect(sanitized.score).toBe(99.5);
      expect(sanitized.deletedAt).toBeNull();
      expect(sanitized.notes).toBeUndefined();
    });
  });
});

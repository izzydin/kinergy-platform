import { PasswordPolicyService } from '../password-policy.service';

describe('PasswordPolicyService', () => {
  let policyService: PasswordPolicyService;

  beforeEach(() => {
    policyService = new PasswordPolicyService();
  });

  describe('validate', () => {
    it('should validate a compliant password successfully', () => {
      const result = policyService.validate('ValidP@ssword123');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty passwords', () => {
      const result = policyService.validate('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password cannot be empty.');
    });

    it('should enforce minimum length rule', () => {
      const result = policyService.validate('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters long.');
    });

    it('should enforce uppercase letter requirement', () => {
      const result = policyService.validate('lowercase123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter (A-Z).');
    });

    it('should enforce lowercase letter requirement', () => {
      const result = policyService.validate('UPPERCASE123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter (a-z).');
    });

    it('should enforce number requirement', () => {
      const result = policyService.validate('NoNumbersHere!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one numeric digit (0-9).');
    });

    it('should enforce special character requirement', () => {
      const result = policyService.validate('NoSpecialChar123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character.');
    });

    it('should support custom policy options', () => {
      const customPolicy = new PasswordPolicyService({
        minLength: 8,
        requireSpecialChar: false,
      });

      const result = customPolicy.validate('SimplePass1');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for a valid password', () => {
      expect(() => policyService.validateOrThrow('ValidP@ssword123')).not.toThrow();
    });

    it('should throw an Error with failure reasons for an invalid password', () => {
      expect(() => policyService.validateOrThrow('weak')).toThrow(
        'Password policy validation failed:',
      );
    });
  });
});

import { PasswordPolicyService } from '../password-policy.service';
import { IPasswordPolicyConfiguration } from '../password-policy-configuration.interface';

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

    it('should reject empty or non-string passwords', () => {
      const result1 = policyService.validate('');
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Password cannot be empty.');

      const result2 = policyService.validate(null as unknown as string);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Password must be a non-empty string.');
    });

    it('should reject unprintable control characters and null bytes', () => {
      const result = policyService.validate('ValidP@ssword123\u0000');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Password contains unprintable or invalid control characters.',
      );
    });

    it('should enforce minimum length rule', () => {
      const result = policyService.validate('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters long.');
    });

    it('should enforce maximum length rule to prevent payload DoS', () => {
      const longPassword = 'A1!' + 'a'.repeat(130);
      const result = policyService.validate(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password cannot exceed 128 characters.');
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

    it('should enforce special character requirement including spaces', () => {
      const result1 = policyService.validate('NoSpecialChar123');
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain(
        'Password must contain at least one special character or space.',
      );

      const result2 = policyService.validate('Valid Password123');
      expect(result2.isValid).toBe(true);
    });

    it('should support custom policy options', () => {
      const customPolicy = new PasswordPolicyService({
        minLength: 8,
        requireSpecialChar: false,
      });

      const result = customPolicy.validate('SimplePass1');
      expect(result.isValid).toBe(true);
    });

    it('should support injected IPasswordPolicyConfiguration', () => {
      const mockConfig: IPasswordPolicyConfiguration = {
        getArgon2MemoryCost: () => 65536,
        getArgon2TimeCost: () => 3,
        getArgon2Parallelism: () => 4,
        getArgon2HashLength: () => 32,
        getMinLength: () => 8,
        getMaxLength: () => 64,
        getRequireUppercase: () => true,
        getRequireLowercase: () => true,
        getRequireNumber: () => true,
        getRequireSpecialChar: () => false,
        getPasswordHistoryLimit: () => 5,
      };

      const customPolicy = new PasswordPolicyService(mockConfig);
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

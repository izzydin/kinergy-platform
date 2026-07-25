import { Injectable } from '@nestjs/common';

/**
 * Configurable policy rules for password complexity validation.
 */
export interface PasswordPolicyOptions {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecialChar?: boolean;
}

/**
 * Result object returned by PasswordPolicyService validation.
 */
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class PasswordPolicyService {
  private readonly options: Required<PasswordPolicyOptions>;

  constructor(options?: PasswordPolicyOptions) {
    this.options = {
      minLength: options?.minLength ?? 12,
      maxLength: options?.maxLength ?? 128,
      requireUppercase: options?.requireUppercase ?? true,
      requireLowercase: options?.requireLowercase ?? true,
      requireNumber: options?.requireNumber ?? true,
      requireSpecialChar: options?.requireSpecialChar ?? true,
    };
  }

  /**
   * Validates a password candidate against configured security policy rules.
   * Returns a structured PasswordValidationResult.
   */
  validate(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password) {
      return {
        isValid: false,
        errors: ['Password cannot be empty.'],
      };
    }

    if (password.length < this.options.minLength) {
      errors.push(`Password must be at least ${this.options.minLength} characters long.`);
    }

    if (password.length > this.options.maxLength) {
      errors.push(`Password cannot exceed ${this.options.maxLength} characters.`);
    }

    if (this.options.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter (A-Z).');
    }

    if (this.options.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter (a-z).');
    }

    if (this.options.requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one numeric digit (0-9).');
    }

    if (
      this.options.requireSpecialChar &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)
    ) {
      errors.push('Password must contain at least one special character.');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates password candidate, throwing an Error if validation fails.
   */
  validateOrThrow(password: string): void {
    const result = this.validate(password);
    if (!result.isValid) {
      throw new Error(`Password policy validation failed: ${result.errors.join(' ')}`);
    }
  }
}

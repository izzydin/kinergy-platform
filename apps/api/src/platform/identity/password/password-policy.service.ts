import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  IPasswordPolicyConfiguration,
  PASSWORD_POLICY_CONFIGURATION,
} from './password-policy-configuration.interface';

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

  constructor(
    @Inject(PASSWORD_POLICY_CONFIGURATION)
    @Optional()
    policyConfig?: IPasswordPolicyConfiguration | PasswordPolicyOptions,
    @Optional()
    explicitOptions?: PasswordPolicyOptions,
  ) {
    let opts: PasswordPolicyOptions | undefined;
    if (
      policyConfig &&
      typeof (policyConfig as IPasswordPolicyConfiguration).getMinLength === 'function'
    ) {
      const cfg = policyConfig as IPasswordPolicyConfiguration;
      opts = {
        minLength: cfg.getMinLength(),
        maxLength: cfg.getMaxLength(),
        requireUppercase: cfg.getRequireUppercase(),
        requireLowercase: cfg.getRequireLowercase(),
        requireNumber: cfg.getRequireNumber(),
        requireSpecialChar: cfg.getRequireSpecialChar(),
        ...explicitOptions,
      };
    } else {
      opts = (policyConfig as PasswordPolicyOptions) ?? explicitOptions;
    }

    this.options = {
      minLength: opts?.minLength ?? 12,
      maxLength: opts?.maxLength ?? 128,
      requireUppercase: opts?.requireUppercase ?? true,
      requireLowercase: opts?.requireLowercase ?? true,
      requireNumber: opts?.requireNumber ?? true,
      requireSpecialChar: opts?.requireSpecialChar ?? true,
    };
  }

  /**
   * Validates a password candidate against configured security policy rules.
   * Returns a structured PasswordValidationResult.
   */
  validate(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password === null || password === undefined || typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['Password must be a non-empty string.'],
      };
    }

    if (password.length === 0) {
      return {
        isValid: false,
        errors: ['Password cannot be empty.'],
      };
    }

    // Edge case check: Null bytes and dangerous control characters
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(password)) {
      return {
        isValid: false,
        errors: ['Password contains unprintable or invalid control characters.'],
      };
    }

    // Character length check (handles Unicode code points)
    const charCount = Array.from(password).length;

    if (charCount < this.options.minLength) {
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
      !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`\s]/.test(password)
    ) {
      errors.push('Password must contain at least one special character or space.');
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

/**
 * Shared Validation Contracts & Assertions
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function createSuccessValidation(): ValidationResult {
  return { isValid: true, errors: [] };
}

export function createFailureValidation(errors: string[]): ValidationResult {
  return { isValid: false, errors };
}

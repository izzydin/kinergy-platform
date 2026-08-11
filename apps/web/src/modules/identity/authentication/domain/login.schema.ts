import { z } from 'zod';

/**
 * Login Credentials Validation Schema
 *
 * Validates user credentials prior to authentication mutation submission.
 * Enforces email syntax formatting, password length rules, and input sanitization.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required.')
    .email('Please enter a valid email address.')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Password is required.')
    .min(8, 'Password must be at least 8 characters long.'),
});

/**
 * Inferred TypeScript type for login form input payload
 */
export type LoginCredentialsInput = z.infer<typeof loginSchema>;

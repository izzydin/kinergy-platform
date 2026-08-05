import { z } from 'zod';

/**
 * Zod Validation Schema for General Workspace Settings
 */
export const generalSettingsSchema = z.object({
  workspaceName: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters.')
    .max(50, 'Workspace name cannot exceed 50 characters.'),
  contactEmail: z.string().email('Please enter a valid email address.'),
  environment: z.enum(['development', 'staging', 'production'], {
    required_error: 'Please select an active deployment environment.',
  }),
  bio: z.string().max(200, 'Bio description cannot exceed 200 characters.').optional(),
});

export type GeneralSettingsFormValues = z.infer<typeof generalSettingsSchema>;

/**
 * Zod Validation Schema for Security Settings Policy
 */
export const securitySettingsSchema = z
  .object({
    currentPassword: z.string().min(8, 'Current password must be at least 8 characters.'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one numeric digit.'),
    confirmPassword: z.string().min(8, 'Please confirm your new password.'),
    twoFactorAuth: z.boolean().default(false),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  });

export type SecuritySettingsFormValues = z.infer<typeof securitySettingsSchema>;

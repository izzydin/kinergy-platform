import { z } from 'zod';
import { httpClient } from '../../../shared/api';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Boundary Schemas (ADR-FE-0019)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the response from GET /api/v1/auth/me (authoritative UserProfileDto).
 * Provides computed display fallbacks for backward compatibility with view components.
 */
export const userProfileSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    status: z.string().default('ACTIVE'),
    roles: z.array(z.string()).default([]),
    permissions: z.array(z.string()).default([]),
    tenantId: z.string().nullable().optional(),
    createdAt: z
      .union([z.string(), z.date()])
      .transform((val) => (typeof val === 'string' ? val : val.toISOString())),
    updatedAt: z
      .union([z.string(), z.date()])
      .transform((val) => (typeof val === 'string' ? val : val.toISOString()))
      .optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    avatarUrl: z.string().nullable().optional(),
  })
  .transform((data): UserProfileViewModel => ({
    id: data.id,
    email: data.email,
    status: data.status,
    roles: data.roles,
    permissions: data.permissions,
    tenantId: data.tenantId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    displayName: data.displayName || data.email.split('@')[0] || 'User',
    role: data.role || data.roles[0] || 'USER',
    avatarUrl: data.avatarUrl ?? null,
  }));

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(2).max(50),
  email: z.string().email(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(8, 'Current password must be at least 8 characters.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API Endpoint Path Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_AUTH_ENDPOINTS = {
  profile: '/api/v1/auth/me',
  changePassword: '/api/v1/auth/change-password',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure Fetch Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the currently authenticated user's profile.
 * Authoritative Backend Route: GET /api/v1/auth/me
 */
export async function fetchUserProfile(): Promise<UserProfileViewModel> {
  const raw = await httpClient.get<unknown>(SETTINGS_AUTH_ENDPOINTS.profile);
  return userProfileSchema.parse(raw);
}

/**
 * Self-service profile updating is NOT supported by the backend identity architecture.
 * The User domain entity only manages credentials, security status, and authorizations.
 * User account updates are restricted to administrative routes (PUT /api/v1/users/:id).
 */
export async function updateUserProfile(_data: UpdateProfileInput): Promise<UserProfileViewModel> {
  throw new Error('Self-service profile updates are not supported by the platform identity API.');
}

/**
 * Changes the current authenticated user's password.
 * Authoritative Backend Route: POST /api/v1/auth/change-password
 */
export async function changePassword(data: ChangePasswordInput): Promise<{ success: boolean }> {
  const payload = changePasswordInputSchema.parse(data);
  return httpClient.post<{ success: boolean }>(SETTINGS_AUTH_ENDPOINTS.changePassword, payload);
}

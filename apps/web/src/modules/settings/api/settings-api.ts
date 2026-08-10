import { z } from 'zod';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Boundary Schemas (ADR-FE-0019)
// ─────────────────────────────────────────────────────────────────────────────

export const userProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  createdAt: z.string(),
});

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(2).max(50),
  email: z.string().email(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

import { httpClient } from '../../../shared/api';

// ─────────────────────────────────────────────────────────────────────────────
// API Endpoint Path Constants
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINTS = {
  profile: '/settings/profile',
  changePassword: '/settings/security/change-password',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure Fetch Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user's profile.
 * MSW handler: GET /api/v1/settings/profile
 */
export async function fetchUserProfile(): Promise<UserProfileViewModel> {
  const raw = await httpClient.get<unknown>(ENDPOINTS.profile);
  return userProfileSchema.parse(raw);
}

/**
 * Updates the current user's display name and email.
 * MSW handler: PATCH /api/v1/settings/profile
 */
export async function updateUserProfile(data: UpdateProfileInput): Promise<UserProfileViewModel> {
  const raw = await httpClient.patch<unknown>(ENDPOINTS.profile, data);
  return userProfileSchema.parse(raw);
}

/**
 * Changes the current user's password.
 * MSW handler: POST /api/v1/settings/security/change-password
 */
export async function changePassword(data: ChangePasswordInput): Promise<{ success: boolean }> {
  return httpClient.post<{ success: boolean }>(ENDPOINTS.changePassword, data);
}

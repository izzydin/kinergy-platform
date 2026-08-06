import { createQueryKeyFactory } from '../../../shared/query/query-key-factory';

/**
 * Settings Domain Query Key Factory (ADR-FE-0018)
 *
 * Provides type-safe hierarchical query keys for all Settings API endpoints.
 *
 * Shape:
 *  settingsKeys.all                    → ['settings']
 *  settingsKeys.profile()              → ['settings', 'profile']
 *  settingsKeys.preferences()          → ['settings', 'preferences']
 */
const _base = createQueryKeyFactory('settings');

export const settingsKeys = {
  ..._base,

  /**
   * User profile — used by useUserProfileQuery and useUpdateProfileMutation
   */
  profile: () => ['settings', 'profile'] as const,

  /**
   * Workspace preferences (future — reserved for preference query expansion)
   */
  preferences: () => ['settings', 'preferences'] as const,
} as const;

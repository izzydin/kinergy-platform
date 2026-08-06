/**
 * @jest-environment node
 */

/**
 * A5.4 — Transport Layer Unit Tests
 *
 * Tests the pure fetch functions (dashboard-api.ts, settings-api.ts) using
 * jest.spyOn(global, 'fetch') to mock network responses without MSW.
 *
 * This approach is necessary because MSW v2 (and its transitive dependencies)
 * are ESM-only packages that cannot be transformed by ts-jest (CJS mode) without
 * complex Babel/experimental ESM setup. The transport functions are thin wrappers
 * that can be tested effectively with direct fetch mocking.
 *
 * The MSW Node server is validated in the dev server (browser worker) context.
 *
 * Covers:
 *  - Success paths for all dashboard + settings fetch functions
 *  - HTTP error propagation (500, 422, 404)
 *  - Empty response handling
 *  - Mutation state persistence (toggle bookmark)
 *  - Zod boundary validation (invalid schema shape throws ZodError)
 *  - Infrastructure health endpoint
 */

import {
  fetchDashboardActivities,
  fetchDashboardMetrics,
  fetchDashboardStatus,
  toggleActivityBookmark,
} from '../dashboard/api/dashboard-api';
import { fetchUserProfile, updateUserProfile, changePassword } from '../settings/api/settings-api';

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockFetchSuccess(body: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(status: number, message: string): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
  } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dashboard Metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — fetchDashboardMetrics', () => {
  it('returns Zod-validated metrics array on success', async () => {
    mockFetchSuccess({
      items: [
        {
          id: 'm-1',
          title: 'Active Energy Monitors',
          value: '1,420',
          change: '+12%',
          trend: 'up',
          category: 'Telemetry',
        },
        {
          id: 'm-2',
          title: 'System Throughput',
          value: '99.98%',
          change: 'Stable',
          trend: 'neutral',
          category: 'Infrastructure',
        },
      ],
    });

    const metrics = await fetchDashboardMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({ id: 'm-1', title: 'Active Energy Monitors', trend: 'up' });
  });

  it('returns empty array when API responds with empty items', async () => {
    mockFetchSuccess({ items: [] });
    const metrics = await fetchDashboardMetrics();
    expect(metrics).toHaveLength(0);
  });

  it('throws with server message on 500 response', async () => {
    mockFetchError(500, 'Failed to load dashboard metrics from remote API gateway.');
    await expect(fetchDashboardMetrics()).rejects.toThrow(
      'Failed to load dashboard metrics from remote API gateway.',
    );
  });

  it('throws ZodError when response schema is invalid', async () => {
    mockFetchSuccess({ items: [{ id: 'm-1', trend: 'invalid-trend' }] });
    await expect(fetchDashboardMetrics()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dashboard Status
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — fetchDashboardStatus', () => {
  it('returns Zod-validated status summary on success', async () => {
    mockFetchSuccess({
      systemStatus: 'operational',
      activeServices: 18,
      totalServices: 18,
      lastUpdated: '2026-08-05T21:00:00.000Z',
    });

    const status = await fetchDashboardStatus();
    expect(status.systemStatus).toBe('operational');
    expect(status.activeServices).toBe(18);
    expect(status.totalServices).toBe(18);
  });

  it('throws on 500 response', async () => {
    mockFetchError(500, 'System health service unavailable.');
    await expect(fetchDashboardStatus()).rejects.toThrow('System health service unavailable.');
  });

  it('throws ZodError on invalid systemStatus value', async () => {
    mockFetchSuccess({
      systemStatus: 'unknown-status',
      activeServices: 5,
      totalServices: 10,
      lastUpdated: '2026-08-05T21:00:00.000Z',
    });
    await expect(fetchDashboardStatus()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dashboard Activities
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — fetchDashboardActivities', () => {
  const MOCK_ACTIVITIES = [
    {
      id: 'act-1',
      title: 'Security audit',
      timestamp: '2026-08-05T20:55:00Z',
      type: 'success',
      bookmarked: false,
    },
    {
      id: 'act-2',
      title: 'Telemetry batch',
      timestamp: '2026-08-05T20:48:00Z',
      type: 'info',
      bookmarked: true,
    },
  ];

  it('returns Zod-validated activity array on success', async () => {
    mockFetchSuccess({ items: MOCK_ACTIVITIES });
    const activities = await fetchDashboardActivities();
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({ id: 'act-1', type: 'success', bookmarked: false });
    expect(activities[1]).toMatchObject({ id: 'act-2', bookmarked: true });
  });

  it('returns empty array for empty items', async () => {
    mockFetchSuccess({ items: [] });
    const activities = await fetchDashboardActivities();
    expect(activities).toHaveLength(0);
  });

  it('throws on 500 error', async () => {
    mockFetchError(500, 'Activity logging service error.');
    await expect(fetchDashboardActivities()).rejects.toThrow('Activity logging service error.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Bookmark Toggle Mutation
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — toggleActivityBookmark', () => {
  it('returns toggled bookmark state from server', async () => {
    mockFetchSuccess({ id: 'act-1', bookmarked: true });
    const result = await toggleActivityBookmark('act-1', true);
    expect(result).toEqual({ id: 'act-1', bookmarked: true });
  });

  it('throws on 404 for unknown activity', async () => {
    mockFetchError(404, "Activity 'unknown-id' not found.");
    await expect(toggleActivityBookmark('unknown-id', true)).rejects.toThrow();
  });

  it('throws on 500 server error during bookmark', async () => {
    mockFetchError(500, 'Bookmark service unavailable.');
    await expect(toggleActivityBookmark('act-1', true)).rejects.toThrow(
      'Bookmark service unavailable.',
    );
  });

  it('sends correct method and body to server', async () => {
    const spy = mockFetchSuccess({ id: 'act-3', bookmarked: false });
    await toggleActivityBookmark('act-3', false);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboard/activities/act-3/bookmark'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bookmarked: false }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Settings — User Profile
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — fetchUserProfile', () => {
  const MOCK_PROFILE = {
    id: 'usr-a5-validation',
    displayName: 'Kinergy Admin',
    email: 'admin@kinergy-platform.io',
    avatarUrl: null,
    role: 'PLATFORM_ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns Zod-validated profile on success', async () => {
    mockFetchSuccess(MOCK_PROFILE);
    const profile = await fetchUserProfile();
    expect(profile).toMatchObject({
      id: 'usr-a5-validation',
      displayName: 'Kinergy Admin',
      role: 'PLATFORM_ADMIN',
    });
    expect(profile.avatarUrl).toBeNull();
  });

  it('throws on 500 server error', async () => {
    mockFetchError(500, 'Profile service unavailable.');
    await expect(fetchUserProfile()).rejects.toThrow('Profile service unavailable.');
  });

  it('throws ZodError on invalid email format in response', async () => {
    mockFetchSuccess({ ...MOCK_PROFILE, email: 'not-an-email' });
    await expect(fetchUserProfile()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Settings — Profile Update (PATCH)
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — updateUserProfile', () => {
  it('returns updated profile on success', async () => {
    mockFetchSuccess({
      id: 'usr-a5-validation',
      displayName: 'Updated Engineer',
      email: 'updated@kinergy.io',
      avatarUrl: null,
      role: 'PLATFORM_ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await updateUserProfile({
      displayName: 'Updated Engineer',
      email: 'updated@kinergy.io',
    });
    expect(result.displayName).toBe('Updated Engineer');
    expect(result.email).toBe('updated@kinergy.io');
  });

  it('throws on 422 validation error', async () => {
    mockFetchError(422, 'Display name must be at least 2 characters.');
    await expect(
      updateUserProfile({ displayName: 'X', email: 'valid@kinergy.io' }),
    ).rejects.toThrow('Display name must be at least 2 characters.');
  });

  it('sends PATCH method with correct body', async () => {
    const spy = mockFetchSuccess({
      id: 'usr-1',
      displayName: 'Name',
      email: 'name@kinergy.io',
      avatarUrl: null,
      role: 'ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await updateUserProfile({ displayName: 'Name', email: 'name@kinergy.io' });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/settings/profile'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Name', email: 'name@kinergy.io' }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Settings — Change Password
// ─────────────────────────────────────────────────────────────────────────────

describe('A5.4 Transport — changePassword', () => {
  it('returns success: true on valid credentials', async () => {
    mockFetchSuccess({ success: true });
    const result = await changePassword({
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
    });
    expect(result).toEqual({ success: true });
  });

  it('throws on 422 with wrong current password', async () => {
    mockFetchError(422, 'Current password is incorrect.');
    await expect(
      changePassword({ currentPassword: 'wrong-password', newPassword: 'NewPass123!' }),
    ).rejects.toThrow('Current password is incorrect.');
  });

  it('throws on 422 when new password equals current', async () => {
    mockFetchError(422, 'New password must differ from the current password.');
    await expect(
      changePassword({ currentPassword: 'SamePass123!', newPassword: 'SamePass123!' }),
    ).rejects.toThrow('New password must differ from the current password.');
  });

  it('sends POST method with correct credentials body', async () => {
    const spy = mockFetchSuccess({ success: true });
    await changePassword({ currentPassword: 'Old!', newPassword: 'New123!' });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/settings/security/change-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ currentPassword: 'Old!', newPassword: 'New123!' }),
      }),
    );
  });
});

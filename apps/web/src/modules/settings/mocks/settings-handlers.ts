import { delay, http, HttpResponse, type RequestHandler } from 'msw';
import type { UserProfileViewModel } from '../../dashboard/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock User Profile State
// ─────────────────────────────────────────────────────────────────────────────

let MOCK_PROFILE: UserProfileViewModel = {
  id: 'usr-a5-validation',
  displayName: 'Kinergy Admin',
  email: 'admin@kinergy-platform.io',
  avatarUrl: null,
  role: 'PLATFORM_ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Dev/test only: reset profile to default between tests */
export function __resetSettingsMockState(): void {
  MOCK_PROFILE = {
    id: 'usr-a5-validation',
    displayName: 'Kinergy Admin',
    email: 'admin@kinergy-platform.io',
    avatarUrl: null,
    role: 'PLATFORM_ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MSW Handlers
// ─────────────────────────────────────────────────────────────────────────────

export const settingsHandlers: RequestHandler[] = [
  http.get('*/api/v1/settings/profile', async () => {
    await delay(180);
    return HttpResponse.json(MOCK_PROFILE);
  }),

  http.patch('*/api/v1/settings/profile', async ({ request }) => {
    await delay(250);

    const body = (await request.json()) as {
      displayName?: string;
      email?: string;
    };

    if (!body.displayName || body.displayName.length < 2) {
      return HttpResponse.json(
        { message: 'Display name must be at least 2 characters.', statusCode: 422 },
        { status: 422 },
      );
    }

    if (!body.email || !body.email.includes('@')) {
      return HttpResponse.json(
        { message: 'A valid email address is required.', statusCode: 422 },
        { status: 422 },
      );
    }

    // Persist the mutation in mock state for subsequent GET calls
    MOCK_PROFILE = {
      ...MOCK_PROFILE,
      displayName: body.displayName,
      email: body.email,
    };

    return HttpResponse.json(MOCK_PROFILE);
  }),

  http.post('*/api/v1/settings/security/change-password', async ({ request }) => {
    await delay(300);

    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (body.currentPassword === 'wrong-password') {
      return HttpResponse.json(
        { message: 'Current password is incorrect.', statusCode: 422 },
        { status: 422 },
      );
    }

    if (body.currentPassword === body.newPassword) {
      return HttpResponse.json(
        { message: 'New password must differ from the current password.', statusCode: 422 },
        { status: 422 },
      );
    }

    return HttpResponse.json({ success: true });
  }),
];

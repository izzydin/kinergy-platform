import { delay, http, HttpResponse, type RequestHandler } from 'msw';

// ─────────────────────────────────────────────────────────────────────────────
// Authoritative Settings & Password MSW Handlers
// ─────────────────────────────────────────────────────────────────────────────

export const settingsHandlers: RequestHandler[] = [
  /**
   * Password Change Handler
   * Authoritative backend route: POST /api/v1/auth/change-password
   */
  http.post('*/api/v1/auth/change-password', async ({ request }) => {
    await delay(100);

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { message: 'Authentication required.', statusCode: 401 },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!body.currentPassword || body.currentPassword.length < 8) {
      return HttpResponse.json(
        { message: 'Current password must be at least 8 characters.', statusCode: 400 },
        { status: 400 },
      );
    }

    if (!body.newPassword || body.newPassword.length < 8) {
      return HttpResponse.json(
        { message: 'New password must be at least 8 characters.', statusCode: 400 },
        { status: 400 },
      );
    }

    if (body.currentPassword === 'wrong-password' || body.currentPassword === 'invalid-password') {
      return HttpResponse.json(
        { message: 'Invalid current password.', statusCode: 400 },
        { status: 400 },
      );
    }

    if (body.currentPassword === body.newPassword) {
      return HttpResponse.json(
        { message: 'New password must differ from current password.', statusCode: 400 },
        { status: 400 },
      );
    }

    if (body.newPassword === 'RecentPass123!') {
      return HttpResponse.json(
        {
          message: 'Password has been used recently. Please choose a new password.',
          statusCode: 400,
        },
        { status: 400 },
      );
    }

    return HttpResponse.json({ success: true }, { status: 200 });
  }),
];

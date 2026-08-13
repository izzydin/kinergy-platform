import { http, HttpResponse, type RequestHandler } from 'msw';
import type { ManagedUser, PaginatedUsersResponse } from '../domain/user.types';
import {
  getMockUserDatabase,
  MOCK_MANAGED_USERS,
  resetMockUserDatabase,
} from './user-management-fixtures';

export { MOCK_MANAGED_USERS, resetMockUserDatabase };

/**
 * MSW Request Handlers for User Management API
 * Intercepts `/api/v1/admin/users*` endpoints at test/dev browser layer.
 */
export const userManagementHandlers: RequestHandler[] = [
  // 1. GET List Users (Search, Filter, Pagination)
  http.get('*/api/v1/admin/users', ({ request }) => {
    const simState = request.headers.get('X-Sim-State');

    if (simState === 'unauthorized') {
      return HttpResponse.json(
        { statusCode: 401, error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }

    if (simState === 'forbidden') {
      return HttpResponse.json(
        { statusCode: 403, error: 'Forbidden', message: 'Insufficient permission manage:users' },
        { status: 403 },
      );
    }

    if (simState === 'server-error') {
      return HttpResponse.json(
        { statusCode: 500, error: 'Internal Server Error', message: 'Database query failed' },
        { status: 500 },
      );
    }

    if (simState === 'network-error') {
      return HttpResponse.error();
    }

    if (simState === 'empty-list') {
      const emptyPayload: PaginatedUsersResponse = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      return HttpResponse.json(emptyPayload, { status: 200 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const statusParam = url.searchParams.get('status');
    const roleParam = url.searchParams.get('role');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10));

    const db = getMockUserDatabase();
    const filtered = db.filter((user) => {
      const matchesQuery =
        !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
      const matchesStatus = !statusParam || user.status === statusParam;
      const matchesRole = !roleParam || user.roles.includes(roleParam as unknown as never);
      return matchesQuery && matchesStatus && matchesRole;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    const payload: PaginatedUsersResponse = {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages,
    };

    return HttpResponse.json(payload, { status: 200 });
  }),

  // 2. GET User by ID
  http.get('*/api/v1/admin/users/:userId', ({ params, request }) => {
    const simState = request.headers.get('X-Sim-State');
    const userId = params.userId as string;

    if (simState === 'not-found') {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: `User ${userId} not found` },
        { status: 404 },
      );
    }

    const db = getMockUserDatabase();
    const user = db.find((u) => u.id === userId);
    if (!user) {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: `User ${userId} not found` },
        { status: 404 },
      );
    }

    return HttpResponse.json(user, { status: 200 });
  }),

  // 3. POST Create User
  http.post('*/api/v1/admin/users', async ({ request }) => {
    const simState = request.headers.get('X-Sim-State');

    if (simState === 'validation-error') {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: ['email must be a valid email address'],
        },
        { status: 400 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: ['email must be a valid email address'],
        },
        { status: 400 },
      );
    }

    const newUser: ManagedUser = {
      id: `usr_${Date.now()}`,
      email: body.email as string,
      name: (body.name as string) || 'New User',
      status: (body.status as ManagedUser['status']) || 'ACTIVE',
      roles: [((body.role as string) || 'MEMBER') as ManagedUser['roles'][number]],
      permissions: ['client:read'],
      tenantId: 'tenant_kinergy_master',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    getMockUserDatabase().unshift(newUser);
    return HttpResponse.json(newUser, { status: 201 });
  }),

  // 4. PUT Update User
  http.put('*/api/v1/admin/users/:userId', async ({ params, request }) => {
    const userId = params.userId as string;
    const body = (await request.json()) as Record<string, unknown>;

    const db = getMockUserDatabase();
    const index = db.findIndex((u) => u.id === userId);
    const existing = db[index];
    if (index === -1 || !existing) {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: `User ${userId} not found` },
        { status: 404 },
      );
    }

    const updatedUser: ManagedUser = {
      ...existing,
      name: typeof body.name === 'string' ? body.name : existing.name,
      roles: body.role ? [body.role as ManagedUser['roles'][number]] : existing.roles,
      updatedAt: new Date().toISOString(),
    };

    db[index] = updatedUser;
    return HttpResponse.json(updatedUser, { status: 200 });
  }),

  // 5. POST Activate User (Semantic Domain Action)
  http.post('*/api/v1/admin/users/:userId/activate', ({ params, request }) => {
    const simState = request.headers.get('X-Sim-State');
    const userId = params.userId as string;

    if (simState === 'activation-failed') {
      return HttpResponse.json(
        { statusCode: 400, error: 'Bad Request', message: 'User account cannot be activated' },
        { status: 400 },
      );
    }

    const db = getMockUserDatabase();
    const index = db.findIndex((u) => u.id === userId);
    const existing = db[index];
    if (index === -1 || !existing) {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: `User ${userId} not found` },
        { status: 404 },
      );
    }

    const updatedUser: ManagedUser = {
      ...existing,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };

    db[index] = updatedUser;
    return HttpResponse.json(updatedUser, { status: 200 });
  }),

  // 6. POST Deactivate User (Semantic Domain Action)
  http.post('*/api/v1/admin/users/:userId/deactivate', ({ params, request }) => {
    const simState = request.headers.get('X-Sim-State');
    const userId = params.userId as string;

    if (simState === 'deactivation-failed') {
      return HttpResponse.json(
        { statusCode: 400, error: 'Bad Request', message: 'User account cannot be deactivated' },
        { status: 400 },
      );
    }

    const db = getMockUserDatabase();
    const index = db.findIndex((u) => u.id === userId);
    const existing = db[index];
    if (index === -1 || !existing) {
      return HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: `User ${userId} not found` },
        { status: 404 },
      );
    }

    const updatedUser: ManagedUser = {
      ...existing,
      status: 'INACTIVE',
      updatedAt: new Date().toISOString(),
    };

    db[index] = updatedUser;
    return HttpResponse.json(updatedUser, { status: 200 });
  }),
];

import {
  activateUser,
  createUser,
  deactivateUser,
  fetchUserById,
  fetchUsers,
  updateUser,
} from '../user-management-api';
import { MOCK_MANAGED_USERS } from '../../mocks/user-management-fixtures';

function mockFetchSuccess(body: unknown, status = 200): jest.Mock {
  const textPayload = typeof body === 'string' ? body : JSON.stringify(body);
  const mockFn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(textPayload),
    json: () => Promise.resolve(body),
  } as Response);
  global.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
}

function mockFetchError(status: number, message: string): jest.Mock {
  const errorPayload = { statusCode: status, message, error: 'API Error' };
  const mockFn = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(errorPayload)),
    json: () => Promise.resolve(errorPayload),
  } as Response);
  global.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
}

describe('User Management API Transport Functions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchUsers', () => {
    it('fetches paginated user list from API', async () => {
      mockFetchSuccess({
        items: MOCK_MANAGED_USERS,
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const response = await fetchUsers({ page: 1, limit: 10 });

      expect(response).toBeDefined();
      expect(response.items).toHaveLength(5);
      expect(response.total).toBe(5);
      expect(response.page).toBe(1);
    });

    it('passes search parameters correctly to API', async () => {
      const spy = mockFetchSuccess({
        items: [MOCK_MANAGED_USERS[1]],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const response = await fetchUsers({ q: 'Operator', status: 'ACTIVE', role: 'OPERATOR' });

      expect(response.items).toHaveLength(1);
      expect(response.items[0]!.name).toBe('Grid Operator');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('q=Operator'), expect.anything());
    });
  });

  describe('fetchUserById', () => {
    it('fetches single user details by ID', async () => {
      mockFetchSuccess(MOCK_MANAGED_USERS[0]);

      const user = await fetchUserById('usr_admin_1');

      expect(user).toBeDefined();
      expect(user.id).toBe('usr_admin_1');
      expect(user.email).toBe('admin@kinergy.io');
      expect(user.name).toBe('Platform Admin');
    });

    it('throws ApiError on non-existent user ID', async () => {
      mockFetchError(404, 'User usr_non_existent not found');

      await expect(fetchUserById('usr_non_existent')).rejects.toThrow();
    });
  });

  describe('createUser', () => {
    it('creates a new user account', async () => {
      const mockCreated = {
        id: 'usr_new_123',
        email: 'new.member@kinergy.io',
        name: 'New Member',
        status: 'ACTIVE',
        roles: ['MEMBER'],
        permissions: ['client:read'],
        tenantId: 'tenant_kinergy_master',
        createdAt: '2026-08-13T12:00:00.000Z',
        updatedAt: '2026-08-13T12:00:00.000Z',
        lastLoginAt: null,
      };

      const spy = mockFetchSuccess(mockCreated, 201);

      const newUser = await createUser({
        email: 'new.member@kinergy.io',
        name: 'New Member',
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      expect(newUser).toBeDefined();
      expect(newUser.email).toBe('new.member@kinergy.io');
      expect(newUser.name).toBe('New Member');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'new.member@kinergy.io',
            name: 'New Member',
            role: 'MEMBER',
            status: 'ACTIVE',
          }),
        }),
      );
    });
  });

  describe('updateUser', () => {
    it('updates user display name and role', async () => {
      const mockUpdated = {
        ...MOCK_MANAGED_USERS[2],
        name: 'Updated Member Name',
        roles: ['OPERATOR'],
      };

      const spy = mockFetchSuccess(mockUpdated);

      const updated = await updateUser('usr_member_1', {
        name: 'Updated Member Name',
        role: 'OPERATOR',
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Member Name');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users/usr_member_1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Member Name',
            role: 'OPERATOR',
          }),
        }),
      );
    });
  });

  describe('activateUser & deactivateUser (Semantic Domain Actions)', () => {
    it('activates an inactive user account', async () => {
      const mockActivated = { ...MOCK_MANAGED_USERS[2], status: 'ACTIVE' };
      const spy = mockFetchSuccess(mockActivated);

      const activated = await activateUser('usr_member_1');

      expect(activated).toBeDefined();
      expect(activated.status).toBe('ACTIVE');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users/usr_member_1/activate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('deactivates an active user account', async () => {
      const mockDeactivated = { ...MOCK_MANAGED_USERS[0], status: 'INACTIVE' };
      const spy = mockFetchSuccess(mockDeactivated);

      const deactivated = await deactivateUser('usr_admin_1');

      expect(deactivated).toBeDefined();
      expect(deactivated.status).toBe('INACTIVE');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users/usr_admin_1/deactivate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

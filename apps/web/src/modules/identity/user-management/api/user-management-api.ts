import { httpClient } from '../../../../shared/api/http-client';
import type {
  CreateUserDTO,
  ManagedUser,
  PaginatedUsersResponse,
  UpdateUserDTO,
  UserListParams,
} from '../domain/user.types';

const ADMIN_USERS_BASE_PATH = '/api/v1/admin/users';

/**
 * Pure HTTP Transport Functions for User Management
 * Consumes the central `httpClient` from shared/api/http-client.
 */

export async function fetchUsers(params?: UserListParams): Promise<PaginatedUsersResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.q) queryParams.q = params.q;
  if (params?.page) queryParams.page = String(params.page);
  if (params?.limit) queryParams.limit = String(params.limit);
  if (params?.status) queryParams.status = params.status;
  if (params?.role) queryParams.role = params.role;

  return httpClient.get<PaginatedUsersResponse>(ADMIN_USERS_BASE_PATH, {
    params: queryParams,
  });
}

export async function fetchUserById(userId: string): Promise<ManagedUser> {
  return httpClient.get<ManagedUser>(`${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(userId)}`);
}

export async function createUser(dto: CreateUserDTO): Promise<ManagedUser> {
  return httpClient.post<ManagedUser>(ADMIN_USERS_BASE_PATH, dto);
}

export async function updateUser(userId: string, dto: UpdateUserDTO): Promise<ManagedUser> {
  return httpClient.put<ManagedUser>(`${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(userId)}`, dto);
}

export async function activateUser(userId: string): Promise<ManagedUser> {
  return httpClient.post<ManagedUser>(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(userId)}/activate`,
  );
}

export async function deactivateUser(userId: string): Promise<ManagedUser> {
  return httpClient.post<ManagedUser>(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(userId)}/deactivate`,
  );
}

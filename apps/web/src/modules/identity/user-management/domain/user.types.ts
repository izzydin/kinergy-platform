/**
 * User Management Domain & API Types
 *
 * Enforces Track B — Step B5.0 / B5.1 User Domain Boundary:
 * Restricts user fields to Identity & Authorization metadata only.
 * Business domain profiles (employee, client, trainer) are strictly excluded.
 */

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'BLOCKED';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'MEMBER';

export interface ManagedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: UserStatus;
  readonly roles: readonly UserRole[];
  readonly permissions: readonly string[];
  readonly tenantId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastLoginAt: string | null;
}

export interface UserListParams {
  readonly q?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly status?: UserStatus;
  readonly role?: UserRole;
  readonly sort?: string;
}

export interface PaginatedUsersResponse {
  readonly items: readonly ManagedUser[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CreateUserDTO {
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly status?: UserStatus;
}

export interface UpdateUserDTO {
  readonly name?: string;
  readonly role?: UserRole;
}

import { UserStatus } from '../../../domain';

export interface CreateUserDto {
  readonly email: string;
  readonly password?: string;
  readonly role?: string;
  readonly tenantId?: string | null;
}

export interface UpdateUserDto {
  readonly userId: string;
  readonly email?: string;
  readonly role?: string;
}

export interface SearchUsersQueryDto {
  readonly email?: string;
  readonly role?: string;
  readonly status?: UserStatus;
  readonly page?: number;
  readonly limit?: number;
}

export interface UserResponseDto {
  readonly id: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly roles: string[];
  readonly permissions: string[];
  readonly tenantId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
}

export interface PaginatedUsersResponseDto {
  readonly items: UserResponseDto[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

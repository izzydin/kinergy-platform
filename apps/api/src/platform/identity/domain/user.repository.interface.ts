import { User } from './user.entity';
import { UserStatus } from './user-status.enum';

export interface UserSearchQuery {
  email?: string;
  role?: string;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

export interface UserSearchResult {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Domain Port Interface for User Identity persistence operations.
 * Completely decoupled from database implementations (Prisma, TypeORM, memory).
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
  save(user: User): Promise<void>;
  search(query: UserSearchQuery): Promise<UserSearchResult>;
  updateRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
    expiresAt?: Date | null,
  ): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');

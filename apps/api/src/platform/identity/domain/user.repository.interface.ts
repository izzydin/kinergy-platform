import { User } from './user.entity';

/**
 * Domain Port Interface for User Identity persistence operations.
 * Completely decoupled from database implementations (Prisma, TypeORM, memory).
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  updateRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
    expiresAt?: Date | null,
  ): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');

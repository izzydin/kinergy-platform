import { Injectable } from '@nestjs/common';
import { User, UserStatus, IUserRepository } from '../../../identity/domain';
import { PrismaService } from '../prisma.service';

/**
 * Production Prisma Implementation for IUserRepository.
 * Maps Prisma User records to domain User entities.
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    const permissions = record.role.permissions.map((rp) => rp.permission.code);

    return new User({
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      status: record.status as UserStatus,
      roles: [record.role.name],
      permissions,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    const permissions = record.role.permissions.map((rp) => rp.permission.code);

    return new User({
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      status: record.status as UserStatus,
      roles: [record.role.name],
      permissions,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async save(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status as UserStatus,
        tenantId: user.tenantId,
        updatedAt: user.updatedAt,
      },
    });
  }

  async updateRefreshToken(
    _userId: string,
    _hashedRefreshToken: string | null,
    _expiresAt?: Date | null,
  ): Promise<void> {
    // Delegated to PrismaRefreshTokenRepository
  }
}

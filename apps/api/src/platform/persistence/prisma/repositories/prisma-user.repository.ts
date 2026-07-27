import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  User,
  UserStatus,
  IUserRepository,
  UserSearchQuery,
  UserSearchResult,
} from '../../../identity/domain';
import { PrismaService } from '../prisma.service';

/**
 * Production Prisma Implementation for IUserRepository.
 * Maps Prisma User records to domain User entities.
 * Dynamically resolves transactional Prisma client when executing within IUnitOfWork contexts.
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get client() {
    return this.prisma.getClient();
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.client.user.findUnique({
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
    const record = await this.client.user.findUnique({
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

  async create(user: User): Promise<void> {
    const roleName = user.roles[0] ?? 'USER';
    const roleRecord = await this.client.role.findUnique({
      where: { name: roleName },
    });

    if (!roleRecord) {
      throw new Error(`Role '${roleName}' not found.`);
    }

    await this.client.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status as UserStatus,
        roleId: roleRecord.id,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }

  async save(user: User): Promise<void> {
    const roleName = user.roles[0];
    let roleId: string | undefined;

    if (roleName) {
      const roleRecord = await this.client.role.findUnique({
        where: { name: roleName },
      });
      if (roleRecord) {
        roleId = roleRecord.id;
      }
    }

    await this.client.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status as UserStatus,
        roleId: roleId,
        tenantId: user.tenantId,
        updatedAt: user.updatedAt,
      },
    });
  }

  async search(query: UserSearchQuery): Promise<UserSearchResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.email) {
      where.email = { contains: query.email, mode: 'insensitive' };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.role) {
      where.role = { name: query.role };
    }

    const [records, total] = await Promise.all([
      this.client.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      }),
      this.client.user.count({ where }),
    ]);

    const items = records.map((record) => {
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
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async updateRefreshToken(
    _userId: string,
    _hashedRefreshToken: string | null,
    _expiresAt?: Date | null,
  ): Promise<void> {
    // Delegated to PrismaRefreshTokenRepository
  }
}

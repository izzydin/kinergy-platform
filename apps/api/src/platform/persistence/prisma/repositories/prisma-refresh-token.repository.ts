import { Injectable } from '@nestjs/common';
import { RefreshToken, IRefreshTokenRepository } from '../../../identity/domain';
import { PrismaService } from '../prisma.service';

/**
 * Production Prisma Implementation for IRefreshTokenRepository.
 * Handles database operations for refresh token sessions with zero leaky abstractions.
 */
@Injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(refreshToken: RefreshToken): Promise<void> {
    await this.prisma.refreshToken.upsert({
      where: { tokenHash: refreshToken.tokenHash },
      create: {
        id: refreshToken.id,
        tokenHash: refreshToken.tokenHash,
        familyId: refreshToken.familyId,
        userId: refreshToken.userId,
        isRevoked: refreshToken.isRevoked,
        expiresAt: refreshToken.expiresAt,
        createdAt: refreshToken.createdAt,
        updatedAt: refreshToken.updatedAt,
      },
      update: {
        isRevoked: refreshToken.isRevoked,
        updatedAt: refreshToken.updatedAt,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      return null;
    }

    return new RefreshToken({
      id: record.id,
      tokenHash: record.tokenHash,
      familyId: record.familyId,
      userId: record.userId,
      isRevoked: record.isRevoked,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByFamilyId(familyId: string): Promise<RefreshToken[]> {
    const records = await this.prisma.refreshToken.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map(
      (record) =>
        new RefreshToken({
          id: record.id,
          tokenHash: record.tokenHash,
          familyId: record.familyId,
          userId: record.userId,
          isRevoked: record.isRevoked,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }),
    );
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    const records = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(
      (record) =>
        new RefreshToken({
          id: record.id,
          tokenHash: record.tokenHash,
          familyId: record.familyId,
          userId: record.userId,
          isRevoked: record.isRevoked,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }),
    );
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: { isRevoked: true },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}

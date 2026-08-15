import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { Room } from '../../../../domain/room/room.aggregate';
import { RoomId } from '../../../../domain/room/room-id.vo';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';
import { RoomRepository } from '../../../../domain/repositories/room.repository';
import { PrismaRoomMapper } from '../mappers/prisma-room.mapper';
import { OptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';

interface PrismaClientProvider {
  getClient?: () => PrismaClient;
}

@Injectable()
export class PrismaRoomRepository implements RoomRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): PrismaClient {
    const provider = this.prisma as unknown as PrismaClientProvider;
    if (typeof provider.getClient === 'function') {
      return provider.getClient() as PrismaClient;
    }
    return this.prisma;
  }

  public async findById(id: RoomId | string): Promise<Room | null> {
    const key = typeof id === 'string' ? id : id.getValue();
    const raw = await this.db.room.findUnique({
      where: { id: key },
      include: { maintenanceWindows: true },
    });

    if (!raw) return null;
    return PrismaRoomMapper.toDomain(raw);
  }

  public async findAvailableRooms(range: TimeRange, requiredFeatures?: string[]): Promise<Room[]> {
    const where: Prisma.RoomWhereInput = {
      status: 'AVAILABLE',
      maintenanceWindows: {
        none: {
          startTime: { lt: range.end },
          endTime: { gt: range.start },
        },
      },
    };

    if (requiredFeatures && requiredFeatures.length > 0) {
      where.features = {
        hasEvery: requiredFeatures.map((f) => f.trim().toLowerCase()),
      };
    }

    const rawList = await this.db.room.findMany({
      where,
      include: { maintenanceWindows: true },
      orderBy: { name: 'asc' },
    });

    return rawList.map((raw) => PrismaRoomMapper.toDomain(raw));
  }

  public async findAll(): Promise<Room[]> {
    const rawList = await this.db.room.findMany({
      include: { maintenanceWindows: true },
      orderBy: { name: 'asc' },
    });

    return rawList.map((raw) => PrismaRoomMapper.toDomain(raw));
  }

  public async save(room: Room): Promise<void> {
    const data = PrismaRoomMapper.toPersistence(room);

    if (room.version === 1) {
      await this.db.room.upsert({
        where: { id: room.id.getValue() },
        create: data,
        update: data,
      });
    } else {
      const priorVersion = room.version - 1;
      const result = await this.db.room.updateMany({
        where: {
          id: room.id.getValue(),
          version: priorVersion,
        },
        data,
      });

      if (result.count === 0) {
        throw new OptimisticLockException('Room', room.id.getValue(), priorVersion);
      }
    }

    // Synchronize Scheduled Maintenance Windows
    const activeMaintenanceWindows = room.maintenanceWindows;
    const activeIds = activeMaintenanceWindows.map((m) => m.id);

    await this.db.maintenanceWindow.deleteMany({
      where: {
        roomId: room.id.getValue(),
        id: { notIn: activeIds },
      },
    });

    for (const mw of activeMaintenanceWindows) {
      await this.db.maintenanceWindow.upsert({
        where: { id: mw.id },
        create: {
          id: mw.id,
          roomId: room.id.getValue(),
          startTime: mw.timeRange.start,
          endTime: mw.timeRange.end,
          reason: mw.reason,
          createdAt: mw.createdAt,
        },
        update: {
          startTime: mw.timeRange.start,
          endTime: mw.timeRange.end,
          reason: mw.reason,
        },
      });
    }
  }
}

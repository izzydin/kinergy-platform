import {
  Room as PrismaRoomModel,
  MaintenanceWindow as PrismaMaintenanceWindowModel,
  RoomStatus as PrismaRoomStatus,
  ResourceType as PrismaResourceType,
} from '@prisma/client';
import { Room } from '../../../../domain/room/room.aggregate';
import { RoomId } from '../../../../domain/room/room-id.vo';
import { RoomStatus } from '../../../../domain/value-objects/room-status.enum';
import { MaintenanceWindow } from '../../../../domain/room/maintenance-window.vo';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';

export type PrismaRoomWithRelations = PrismaRoomModel & {
  maintenanceWindows?: PrismaMaintenanceWindowModel[];
};

export class PrismaRoomMapper {
  public static toDomain(raw: PrismaRoomWithRelations): Room {
    const maintenanceWindows = (raw.maintenanceWindows ?? []).map((m) =>
      MaintenanceWindow.create({
        id: m.id,
        timeRange: TimeRange.create(m.startTime, m.endTime),
        reason: m.reason ?? 'Scheduled maintenance',
        createdAt: m.createdAt,
      }),
    );

    return Room.reconstitute({
      id: RoomId.create(raw.id),
      version: raw.version,
      name: raw.name,
      capacity: raw.capacity,
      status: raw.status as unknown as RoomStatus,
      features: raw.features,
      maintenanceWindows,
      maintenanceReason: raw.maintenanceReason ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(room: Room): Omit<PrismaRoomModel, 'createdAt' | 'updatedAt'> {
    return {
      id: room.id.getValue(),
      name: room.name,
      capacity: room.capacity,
      status: room.status as unknown as PrismaRoomStatus,
      resourceType: room.resourceType as unknown as PrismaResourceType,
      features: Array.from(room.features),
      maintenanceReason: room.maintenanceReason ?? null,
      version: room.version,
    };
  }
}

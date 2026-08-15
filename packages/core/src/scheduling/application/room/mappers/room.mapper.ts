import { Room } from '../../../domain/room/room.aggregate';
import { MaintenanceWindow } from '../../../domain/room/maintenance-window.vo';
import { RoomDTO } from '../dtos/room.dto';
import { MaintenanceWindowDTO } from '../dtos/maintenance-window.dto';

export class RoomMapper {
  public static toDTO(room: Room): RoomDTO {
    return {
      id: room.id.getValue(),
      name: room.name,
      capacity: room.capacity,
      status: room.status,
      resourceType: room.resourceType,
      features: Array.from(room.features),
      maintenanceReason: room.maintenanceReason,
      maintenanceWindows: room.maintenanceWindows.map((mw) =>
        RoomMapper.toMaintenanceWindowDTO(mw),
      ),
      version: room.version,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  public static toMaintenanceWindowDTO(mw: MaintenanceWindow): MaintenanceWindowDTO {
    return {
      id: mw.id,
      startTime: mw.timeRange.start.toISOString(),
      endTime: mw.timeRange.end.toISOString(),
      reason: mw.reason,
      createdAt: mw.createdAt.toISOString(),
    };
  }
}

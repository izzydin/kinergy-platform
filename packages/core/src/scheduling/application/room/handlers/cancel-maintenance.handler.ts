import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CancelMaintenanceCommand } from '../commands/cancel-maintenance.command';
import { RoomDTO } from '../dtos/room.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { RoomId } from '../../../domain/room/room-id.vo';
import { OptimisticLockException } from '../../../domain/exceptions/optimistic-lock.exception';

export class CancelMaintenanceHandler implements CommandHandler<
  CancelMaintenanceCommand,
  ApplicationResult<RoomDTO>
> {
  constructor(private readonly roomRepository: RoomRepository) {}

  public async execute(command: CancelMaintenanceCommand): Promise<ApplicationResult<RoomDTO>> {
    try {
      const { input } = command;

      const room = await this.roomRepository.findById(RoomId.create(input.roomId));
      if (!room) {
        return ApplicationResult.fail(`Room with id '${input.roomId}' not found.`);
      }

      if (input.expectedVersion !== undefined && room.version !== input.expectedVersion) {
        throw new OptimisticLockException('Room', input.roomId, input.expectedVersion);
      }

      const cancelled = room.cancelMaintenance(input.maintenanceWindowId);
      if (!cancelled) {
        return ApplicationResult.fail(
          `Maintenance window with id '${input.maintenanceWindowId}' not found in room '${input.roomId}'.`,
        );
      }

      await this.roomRepository.save(room);

      return ApplicationResult.ok(RoomMapper.toDTO(room));
    } catch (error: unknown) {
      if (error instanceof OptimisticLockException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Failed to cancel maintenance.';
      return ApplicationResult.fail(message);
    }
  }
}

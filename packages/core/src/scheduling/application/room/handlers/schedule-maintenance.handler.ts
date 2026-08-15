import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { ScheduleMaintenanceCommand } from '../commands/schedule-maintenance.command';
import { RoomDTO } from '../dtos/room.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { RoomId } from '../../../domain/room/room-id.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { OptimisticLockException } from '../../../domain/exceptions/optimistic-lock.exception';

export class ScheduleMaintenanceHandler implements CommandHandler<
  ScheduleMaintenanceCommand,
  ApplicationResult<RoomDTO>
> {
  constructor(private readonly roomRepository: RoomRepository) {}

  public async execute(command: ScheduleMaintenanceCommand): Promise<ApplicationResult<RoomDTO>> {
    try {
      const { input } = command;

      const room = await this.roomRepository.findById(RoomId.create(input.roomId));
      if (!room) {
        return ApplicationResult.fail(`Room with id '${input.roomId}' not found.`);
      }

      if (input.expectedVersion !== undefined && room.version !== input.expectedVersion) {
        throw new OptimisticLockException('Room', input.roomId, input.expectedVersion);
      }

      const start = new Date(input.startTime);
      const end = new Date(input.endTime);
      const timeRange = TimeRange.create(start, end);

      room.scheduleMaintenance({
        timeRange,
        reason: input.reason,
      });

      await this.roomRepository.save(room);

      return ApplicationResult.ok(RoomMapper.toDTO(room));
    } catch (error: unknown) {
      if (error instanceof OptimisticLockException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Failed to schedule maintenance.';
      return ApplicationResult.fail(message);
    }
  }
}

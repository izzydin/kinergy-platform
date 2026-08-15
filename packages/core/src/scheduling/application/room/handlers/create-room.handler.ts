import { CommandHandler } from '../../shared/command-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CreateRoomCommand } from '../commands/create-room.command';
import { RoomDTO } from '../dtos/room.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { Room } from '../../../domain/room/room.aggregate';
import { RoomId } from '../../../domain/room/room-id.vo';

export class CreateRoomHandler implements CommandHandler<
  CreateRoomCommand,
  ApplicationResult<RoomDTO>
> {
  constructor(private readonly roomRepository: RoomRepository) {}

  public async execute(command: CreateRoomCommand): Promise<ApplicationResult<RoomDTO>> {
    try {
      const { input } = command;

      if (!input.name || input.name.trim().length === 0) {
        return ApplicationResult.fail('Room name cannot be empty.');
      }

      const capacity = input.capacity ?? 1;
      if (!Number.isInteger(capacity) || capacity <= 0) {
        return ApplicationResult.fail(
          'Room capacity must be a positive integer strictly greater than zero.',
        );
      }

      const roomId = input.id ? RoomId.create(input.id) : RoomId.create();

      const room = Room.create({
        id: roomId,
        name: input.name,
        capacity,
        features: input.features ?? [],
      });

      await this.roomRepository.save(room);

      return ApplicationResult.ok(RoomMapper.toDTO(room));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create room.';
      return ApplicationResult.fail(message);
    }
  }
}

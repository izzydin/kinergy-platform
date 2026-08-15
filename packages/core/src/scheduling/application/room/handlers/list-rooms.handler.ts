import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { ListRoomsQuery } from '../queries/list-rooms.query';
import { RoomDTO } from '../dtos/room.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';

export class ListRoomsHandler implements QueryHandler<
  ListRoomsQuery,
  ApplicationResult<RoomDTO[]>
> {
  constructor(private readonly roomRepository: RoomRepository) {}

  public async execute(query?: ListRoomsQuery): Promise<ApplicationResult<RoomDTO[]>> {
    try {
      const allRooms = await this.roomRepository.findAll();
      const input = query?.input;

      let filtered = allRooms;

      if (input?.status) {
        filtered = filtered.filter((r) => r.status.toUpperCase() === input.status!.toUpperCase());
      }

      if (input?.minCapacity !== undefined) {
        filtered = filtered.filter((r) => r.capacity >= input.minCapacity!);
      }

      if (input?.requiredFeatures && input.requiredFeatures.length > 0) {
        filtered = filtered.filter((r) => r.supportsFeatures(input.requiredFeatures!));
      }

      return ApplicationResult.ok(filtered.map((r) => RoomMapper.toDTO(r)));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list rooms.';
      return ApplicationResult.fail(message);
    }
  }
}

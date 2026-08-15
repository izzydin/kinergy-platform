import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { GetRoomQuery } from '../queries/get-room.query';
import { RoomDTO } from '../dtos/room.dto';
import { RoomMapper } from '../mappers/room.mapper';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { RoomId } from '../../../domain/room/room-id.vo';

export class GetRoomHandler implements QueryHandler<GetRoomQuery, ApplicationResult<RoomDTO>> {
  constructor(private readonly roomRepository: RoomRepository) {}

  public async execute(query: GetRoomQuery): Promise<ApplicationResult<RoomDTO>> {
    try {
      const room = await this.roomRepository.findById(RoomId.create(query.input.roomId));

      if (!room) {
        return ApplicationResult.fail(`Room with id '${query.input.roomId}' not found.`);
      }

      return ApplicationResult.ok(RoomMapper.toDTO(room));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve room.';
      return ApplicationResult.fail(message);
    }
  }
}

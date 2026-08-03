import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';
import { TimeRange } from '../value-objects/time-range.vo';

export interface RoomRepository {
  findById(id: RoomId | string): Promise<Room | null>;
  findAvailableRooms(range: TimeRange, requiredFeatures?: string[]): Promise<Room[]>;
  findAll(): Promise<Room[]>;
  save(room: Room): Promise<void>;
}

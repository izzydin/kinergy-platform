import { Room } from '../room/room.aggregate';

export interface RoomRepository {
  findById(roomId: string): Promise<Room | null>;
  findAll(): Promise<Room[]>;
  save(room: Room): Promise<void>;
}

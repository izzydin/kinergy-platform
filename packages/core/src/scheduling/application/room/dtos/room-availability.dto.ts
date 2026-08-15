import { RoomDTO } from './room.dto';

export interface RoomAvailabilityDTO {
  isAvailable: boolean;
  roomId?: string;
  availableRooms: RoomDTO[];
  conflicts: string[];
}

import { BaseSpecification } from './base.specification';
import { Room } from '../room/room.aggregate';
import { RoomStatus } from '../value-objects/room-status.enum';
import { TimeRange } from '../value-objects/time-range.vo';

export interface RoomAvailabilityCandidate {
  readonly room: Room;
  readonly range?: TimeRange;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

export class RoomAvailabilitySpecification extends BaseSpecification<RoomAvailabilityCandidate> {
  public isSatisfiedBy(candidate: RoomAvailabilityCandidate): boolean {
    if (!candidate || !candidate.room) {
      return false;
    }

    if (candidate.room.status !== RoomStatus.AVAILABLE) {
      return false;
    }

    if (
      candidate.requiredCapacity !== undefined &&
      candidate.room.capacity < candidate.requiredCapacity
    ) {
      return false;
    }

    if (
      candidate.requiredFeatures &&
      candidate.requiredFeatures.length > 0 &&
      !candidate.room.supportsFeatures(candidate.requiredFeatures)
    ) {
      return false;
    }

    return true;
  }
}

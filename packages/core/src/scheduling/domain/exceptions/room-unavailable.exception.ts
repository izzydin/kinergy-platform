import { SchedulingDomainException } from './scheduling.exception';

export class RoomUnavailableException extends SchedulingDomainException {
  public readonly code = 'ROOM_UNAVAILABLE';

  constructor(
    public readonly roomId: string,
    message?: string,
  ) {
    super(message ?? `Room '${roomId}' is unavailable or undergoing maintenance.`);
  }
}

import { DomainEvent } from '../shared/domain-event';

export interface RoomAssignedPayload {
  readonly appointmentId: string;
  readonly oldRoomId: string;
  readonly newRoomId: string;
  readonly assignedAt: Date;
}

export class RoomAssignedEvent implements DomainEvent<RoomAssignedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomAssigned';
  public readonly name = 'RoomAssigned';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomAssignedPayload;

  constructor(
    appointmentId: string,
    oldRoomId: string,
    newRoomId: string,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      appointmentId,
      oldRoomId,
      newRoomId,
      assignedAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.newRoomId;
  }
}

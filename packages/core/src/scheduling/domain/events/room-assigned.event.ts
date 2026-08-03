import { DomainEvent } from '../shared/domain-event';

export interface RoomAssignedPayload {
  readonly appointmentId: string;
  readonly previousRoomId: string;
  readonly newRoomId: string;
  readonly assignedAt: Date;
}

export class RoomAssignedEvent implements DomainEvent<RoomAssignedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomAssigned';
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly payload: RoomAssignedPayload;

  constructor(
    appointmentId: string,
    previousRoomId: string,
    newRoomId: string,
    assignedAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = appointmentId;
    this.occurredOn = assignedAt;
    this.payload = {
      appointmentId,
      previousRoomId,
      newRoomId,
      assignedAt,
    };
    Object.freeze(this);
  }
}

import { DomainEvent } from '../shared/domain-event';

export interface RoomDeactivatedPayload {
  readonly roomId: string;
  readonly reason?: string;
  readonly deactivatedAt: Date;
}

export class RoomDeactivatedEvent implements DomainEvent<RoomDeactivatedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomDeactivated';
  public readonly name = 'RoomDeactivated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomDeactivatedPayload;

  constructor(roomId: string, version: number, reason?: string, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = roomId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      roomId,
      reason,
      deactivatedAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.roomId;
  }
}

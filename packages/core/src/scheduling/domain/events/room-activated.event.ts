import { DomainEvent } from '../shared/domain-event';

export interface RoomActivatedPayload {
  readonly roomId: string;
  readonly activatedAt: Date;
}

export class RoomActivatedEvent implements DomainEvent<RoomActivatedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomActivated';
  public readonly name = 'RoomActivated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomActivatedPayload;

  constructor(roomId: string, version: number, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = roomId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      roomId,
      activatedAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.roomId;
  }
}

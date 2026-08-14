import { DomainEvent } from '../shared/domain-event';

export interface RoomCreatedPayload {
  readonly roomId: string;
  readonly name: string;
  readonly capacity: number;
  readonly features: string[];
  readonly createdAt: Date;
}

export class RoomCreatedEvent implements DomainEvent<RoomCreatedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomCreated';
  public readonly name = 'RoomCreated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomCreatedPayload;

  constructor(
    roomId: string,
    name: string,
    capacity: number,
    features: string[],
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = roomId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      roomId,
      name,
      capacity,
      features,
      createdAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.roomId;
  }
}

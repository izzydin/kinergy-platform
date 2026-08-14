import { DomainEvent } from '../shared/domain-event';

export interface RoomMarkedMaintenancePayload {
  readonly roomId: string;
  readonly reason: string;
  readonly markedAt: Date;
}

export class RoomMarkedMaintenanceEvent implements DomainEvent<RoomMarkedMaintenancePayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomMarkedMaintenance';
  public readonly name = 'RoomMarkedMaintenance';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomMarkedMaintenancePayload;

  constructor(roomId: string, version: number, reason: string, occurredAt: Date = new Date()) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = roomId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      roomId,
      reason,
      markedAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.roomId;
  }
}

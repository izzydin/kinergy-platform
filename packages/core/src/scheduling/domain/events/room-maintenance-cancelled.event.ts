import { DomainEvent } from '../shared/domain-event';

export interface RoomMaintenanceCancelledPayload {
  readonly roomId: string;
  readonly maintenanceId: string;
  readonly cancelledAt: Date;
}

export class RoomMaintenanceCancelledEvent implements DomainEvent<RoomMaintenanceCancelledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomMaintenanceCancelled';
  public readonly name = 'RoomMaintenanceCancelled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomMaintenanceCancelledPayload;

  constructor(
    roomId: string,
    maintenanceId: string,
    version: number,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = roomId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      roomId,
      maintenanceId,
      cancelledAt: occurredAt,
    };
    Object.freeze(this);
  }

  public get roomId(): string {
    return this.payload.roomId;
  }

  public get maintenanceId(): string {
    return this.payload.maintenanceId;
  }
}

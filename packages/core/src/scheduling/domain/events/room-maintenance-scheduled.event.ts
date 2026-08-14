import { DomainEvent } from '../shared/domain-event';
import { TimeRange } from '../value-objects/time-range.vo';

export interface RoomMaintenanceScheduledPayload {
  readonly roomId: string;
  readonly maintenanceId: string;
  readonly timeRange: TimeRange;
  readonly reason: string;
  readonly scheduledAt: Date;
}

export class RoomMaintenanceScheduledEvent implements DomainEvent<RoomMaintenanceScheduledPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RoomMaintenanceScheduled';
  public readonly name = 'RoomMaintenanceScheduled';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RoomMaintenanceScheduledPayload;

  constructor(
    roomId: string,
    maintenanceId: string,
    timeRange: TimeRange,
    reason: string,
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
      timeRange,
      reason,
      scheduledAt: occurredAt,
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

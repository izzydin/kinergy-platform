import { DomainEvent } from '../shared/domain-event';

export interface RecurringAppointmentCreatedPayload {
  readonly seriesId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly frequency: string;
  readonly startDate: Date;
  readonly endDate?: Date;
  readonly maxOccurrences?: number;
  readonly createdAt: Date;
}

export class RecurringAppointmentCreatedEvent implements DomainEvent<RecurringAppointmentCreatedPayload> {
  public readonly eventId: string;
  public readonly eventName = 'RecurringAppointmentCreated';
  public readonly name = 'RecurringAppointmentCreated';
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredOn: Date;
  public readonly occurredAt: Date;
  public readonly payload: RecurringAppointmentCreatedPayload;

  constructor(
    seriesId: string,
    clientId: string,
    therapistId: string,
    roomId: string,
    serviceType: string,
    frequency: string,
    startDate: Date,
    endDate?: Date,
    maxOccurrences?: number,
    version: number = 1,
    occurredAt: Date = new Date(),
  ) {
    this.eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.aggregateId = seriesId;
    this.version = version;
    this.occurredOn = occurredAt;
    this.occurredAt = occurredAt;
    this.payload = {
      seriesId,
      clientId,
      therapistId,
      roomId,
      serviceType,
      frequency,
      startDate,
      endDate,
      maxOccurrences,
      createdAt: occurredAt,
    };
    Object.freeze(this);
  }
}

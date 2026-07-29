import { IDomainEvent } from '../kernel';

export class ClientRestoredEvent implements IDomainEvent {
  public readonly occurredAt: Date;
  public readonly dateTimeOccurred: Date;

  constructor(
    public readonly clientId: string,
    occurredAt?: Date,
  ) {
    this.occurredAt = occurredAt ?? new Date();
    this.dateTimeOccurred = this.occurredAt;
  }

  public getAggregateId(): string {
    return this.clientId;
  }
}

import { IDomainEvent } from '../kernel';

export class IdentityLinkedEvent implements IDomainEvent {
  public readonly occurredAt: Date;
  public readonly dateTimeOccurred: Date;

  constructor(
    public readonly clientId: string,
    public readonly identityId: string,
    occurredAt?: Date,
  ) {
    this.occurredAt = occurredAt ?? new Date();
    this.dateTimeOccurred = this.occurredAt;
  }

  public getAggregateId(): string {
    return this.clientId;
  }
}

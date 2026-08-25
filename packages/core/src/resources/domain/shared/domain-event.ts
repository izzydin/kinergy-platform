export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  readonly payload?: TPayload;
}

export type ResourceDomainEvent<TPayload = unknown> = DomainEvent<TPayload>;

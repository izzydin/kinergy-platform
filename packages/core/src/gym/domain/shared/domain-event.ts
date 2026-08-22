export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  readonly payload?: TPayload;
}

export type GymDomainEvent<TPayload = unknown> = DomainEvent<TPayload>;

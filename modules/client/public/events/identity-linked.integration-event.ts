import { randomUUID } from 'crypto';

/**
 * @public
 * Integration event published when an authentication identity is linked to a client profile.
 *
 * Consuming bounded contexts subscribe to this event to associate a system user account
 * with a client record — e.g. enabling self-service booking or personalised billing.
 *
 * @remarks
 * - This is an **integration event contract** — it crosses bounded-context boundaries.
 * - It is distinct from the internal `IdentityLinkedEvent` domain event.
 * - All properties are `readonly` to ensure immutability after construction.
 * - `schemaVersion` enables consumers to handle versioned payload changes gracefully.
 */
export class IdentityLinkedIntegrationEvent {
  /** Unique identifier for this specific event instance (UUID v4). */
  readonly eventId: string;

  /** Schema version of this event payload. Increment when breaking changes are introduced. */
  readonly schemaVersion = 1 as const;

  /** UUID of the client whose identity was linked. */
  readonly clientId: string;

  /** UUID of the authentication identity (user account) that was linked. */
  readonly identityId: string;

  /** Wall-clock timestamp when the domain event occurred. */
  readonly occurredAt: Date;

  constructor(payload: { clientId: string; identityId: string; occurredAt: Date }) {
    this.eventId = randomUUID();
    this.clientId = payload.clientId;
    this.identityId = payload.identityId;
    this.occurredAt = payload.occurredAt;
  }
}

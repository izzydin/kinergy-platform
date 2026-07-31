import { randomUUID } from 'crypto';

/**
 * @public
 * Integration event published when a previously-archived client profile is restored to ACTIVE.
 *
 * Consuming bounded contexts subscribe to this event to re-enable client access —
 * e.g. reactivating a suspended membership or re-enabling POS access.
 *
 * @remarks
 * - This is an **integration event contract** — it crosses bounded-context boundaries.
 * - It is distinct from the internal `ClientRestoredEvent` domain event.
 * - All properties are `readonly` to ensure immutability after construction.
 * - `schemaVersion` enables consumers to handle versioned payload changes gracefully.
 */
export class ClientRestoredIntegrationEvent {
  /** Unique identifier for this specific event instance (UUID v4). */
  readonly eventId: string;

  /** Schema version of this event payload. Increment when breaking changes are introduced. */
  readonly schemaVersion = 1 as const;

  /** UUID of the client that was restored to ACTIVE. */
  readonly clientId: string;

  /** Wall-clock timestamp when the domain event occurred. */
  readonly occurredAt: Date;

  constructor(payload: { clientId: string; occurredAt: Date }) {
    this.eventId = randomUUID();
    this.clientId = payload.clientId;
    this.occurredAt = payload.occurredAt;
  }
}

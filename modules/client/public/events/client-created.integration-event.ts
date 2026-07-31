import { randomUUID } from 'crypto';

/**
 * @public
 * Integration event published when a new client profile is successfully registered.
 *
 * Consuming bounded contexts (Appointments, Memberships, POS, Billing, Nutrition, Rentals)
 * subscribe to this event to react to new client registrations — e.g. provisioning a
 * membership account or creating an appointment eligibility record.
 *
 * @remarks
 * - This is an **integration event contract** — it crosses bounded-context boundaries.
 * - It is distinct from the internal `ClientCreatedEvent` domain event.
 * - All properties are `readonly` to ensure immutability after construction.
 * - `schemaVersion` enables consumers to handle versioned payload changes gracefully.
 */
export class ClientCreatedIntegrationEvent {
  /** Unique identifier for this specific event instance (UUID v4). */
  readonly eventId: string;

  /** Schema version of this event payload. Increment when breaking changes are introduced. */
  readonly schemaVersion = 1 as const;

  /** UUID of the newly registered client. */
  readonly clientId: string;

  /** Human-readable reference number assigned at registration, e.g. `CLI-2026-00001`. */
  readonly referenceNumber: string;

  /** Email address provided at registration. */
  readonly email: string;

  /** E.164-formatted phone number provided at registration. */
  readonly phone: string;

  /** Wall-clock timestamp when the domain event occurred. */
  readonly occurredAt: Date;

  constructor(payload: {
    clientId: string;
    referenceNumber: string;
    email: string;
    phone: string;
    occurredAt: Date;
  }) {
    this.eventId = randomUUID();
    this.clientId = payload.clientId;
    this.referenceNumber = payload.referenceNumber;
    this.email = payload.email;
    this.phone = payload.phone;
    this.occurredAt = payload.occurredAt;
  }
}

/**
 * @public
 * Lightweight summary DTO exposed to external bounded contexts via {@link IClientFacade}.
 *
 * External modules (Appointments, Memberships, POS, Billing, Nutrition, Rentals) MUST
 * use this type — never the internal {@link Client} aggregate — when referencing client data.
 *
 * @remarks
 * This DTO deliberately omits internal fields (version, createdAt, updatedAt, identityId)
 * that have no meaning outside the Client bounded context.
 */
export class ClientSummaryDto {
  /** Stable UUID primary key for the client record. */
  readonly id!: string;

  /** Human-readable reference number, e.g. `CLI-2026-00001`. */
  readonly referenceNumber!: string;

  /** Concatenated first + last name. */
  readonly fullName!: string;

  /** Normalized email address. */
  readonly email!: string;

  /** E.164-formatted phone number. */
  readonly phone!: string;

  /** Lifecycle status: `ACTIVE` or `ARCHIVED`. */
  readonly status!: string;
}

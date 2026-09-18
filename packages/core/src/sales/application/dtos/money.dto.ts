/**
 * Canonical Application DTO representing monetary amounts across the API boundary.
 * Defined by Milestone 7.4 Monetary Policy (ADR-0114).
 *
 * Guarantees zero precision loss by providing both major unit decimal number,
 * integer minor units (cents), and deterministic string formatting.
 */
export interface MoneyDTO {
  /**
   * Monetary amount in major currency units (e.g., 49.99).
   * Exact 2-decimal scale, non-negative.
   */
  readonly amount: number;

  /**
   * Normalized 3-letter uppercase ISO-4217 currency code (e.g., 'USD').
   */
  readonly currency: string;

  /**
   * Deterministic string representation with exact 2 decimal places (e.g., '49.99').
   * Guarantees zero floating-point drift across arbitrary JSON deserializers.
   */
  readonly formatted: string;

  /**
   * Exact integer amount in minor currency units (cents, e.g., 4999).
   */
  readonly cents: number;
}

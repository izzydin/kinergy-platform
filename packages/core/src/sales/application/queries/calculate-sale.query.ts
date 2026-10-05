export interface CalculateSaleInput {
  saleId: string;
}

/**
 * CalculateSaleQuery requests authoritative financial totals for an existing Sale aggregate.
 * Classified as a QUERY (read-only calculation without persistence).
 */
export class CalculateSaleQuery {
  constructor(public readonly input: CalculateSaleInput) {}
}

/**
 * Command alias in case caller dispatch pipelines classify calculation under command bus semantics.
 */
export const CalculateSaleCommand = CalculateSaleQuery;
export type CalculateSaleCommand = CalculateSaleQuery;

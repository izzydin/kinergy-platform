import { SaleCurrentUser } from '../shared/sale-authorization';

export interface GetSaleInput {
  saleId: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
}

/**
 * GetSaleQuery requests the complete authoritative commercial representation of a Sale.
 * Classified as a read-only QUERY without side-effects or aggregate mutations.
 */
export class GetSaleQuery {
  constructor(public readonly input: GetSaleInput) {}
}

export type GetSaleByIdInput = GetSaleInput;
export const GetSaleByIdQuery = GetSaleQuery;
export type GetSaleByIdQuery = GetSaleQuery;

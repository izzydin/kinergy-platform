import { SaleCurrentUser } from '../shared/sale-authorization';

export interface FinalizeSaleInput {
  saleId: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
}

export class FinalizeSaleCommand {
  constructor(public readonly input: FinalizeSaleInput) {}
}

import { SaleCurrentUser } from '../shared/sale-authorization';

export interface CancelSaleInput {
  saleId: string;
  reason: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
}

export class CancelSaleCommand {
  constructor(public readonly input: CancelSaleInput) {}
}

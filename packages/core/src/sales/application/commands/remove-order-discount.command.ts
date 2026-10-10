import { SaleCurrentUser } from '../shared/sale-authorization';

export interface RemoveOrderDiscountInput {
  saleId: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
}

export class RemoveOrderDiscountCommand {
  constructor(public readonly input: RemoveOrderDiscountInput) {}
}

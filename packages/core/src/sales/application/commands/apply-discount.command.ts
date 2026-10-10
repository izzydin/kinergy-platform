import { SaleCurrentUser } from '../shared/sale-authorization';

export interface ApplyDiscountInput {
  saleId: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
  discount: {
    type: string;
    value: number;
    reason?: string | null;
  };
}

export class ApplyDiscountCommand {
  constructor(public readonly input: ApplyDiscountInput) {}
}

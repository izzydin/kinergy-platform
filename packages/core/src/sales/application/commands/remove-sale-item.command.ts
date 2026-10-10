import { SaleCurrentUser } from '../shared/sale-authorization';

export interface RemoveSaleItemInput {
  saleId: string;
  itemId: string;
  tenantId?: string;
  currentUser?: SaleCurrentUser;
}

export class RemoveSaleItemCommand {
  constructor(public readonly input: RemoveSaleItemInput) {}
}

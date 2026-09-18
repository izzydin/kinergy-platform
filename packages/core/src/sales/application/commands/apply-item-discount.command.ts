export interface ApplyItemDiscountInput {
  saleId: string;
  itemId: string;
  discount: {
    type: string;
    value: number;
    reason?: string | null;
  };
}

export class ApplyItemDiscountCommand {
  constructor(public readonly input: ApplyItemDiscountInput) {}
}

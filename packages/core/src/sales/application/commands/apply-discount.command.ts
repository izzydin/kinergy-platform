export interface ApplyDiscountInput {
  saleId: string;
  discount: {
    type: string;
    value: number;
    reason?: string | null;
  };
}

export class ApplyDiscountCommand {
  constructor(public readonly input: ApplyDiscountInput) {}
}

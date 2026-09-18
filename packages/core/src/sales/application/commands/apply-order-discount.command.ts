export interface ApplyOrderDiscountInput {
  saleId: string;
  discount: {
    type: string;
    value: number;
    reason?: string | null;
  };
}

export class ApplyOrderDiscountCommand {
  constructor(public readonly input: ApplyOrderDiscountInput) {}
}

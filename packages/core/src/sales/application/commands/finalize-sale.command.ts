export interface FinalizeSaleInput {
  saleId: string;
}

export class FinalizeSaleCommand {
  constructor(public readonly input: FinalizeSaleInput) {}
}

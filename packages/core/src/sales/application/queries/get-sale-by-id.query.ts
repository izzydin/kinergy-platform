export interface GetSaleByIdInput {
  saleId: string;
}

export class GetSaleByIdQuery {
  constructor(public readonly input: GetSaleByIdInput) {}
}

import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';

export interface AddSaleItemInput {
  saleId: string;
  source?: {
    sourceType: SourceType | SaleSourceType | string;
    sourceId: string;
    sourceCode?: string | null;
  };
  description: string;
  skuOrCode?: string | null;
  quantity: number;
  unitPriceAmount: number;
  discount?: {
    type: string;
    value: number;
    reason?: string | null;
  } | null;
}

export class AddSaleItemCommand {
  constructor(public readonly input: AddSaleItemInput) {}
}

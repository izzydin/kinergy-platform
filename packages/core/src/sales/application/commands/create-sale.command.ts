import { SourceType } from '../../domain/enums/source-type.enum';

export interface CreateSaleItemInput {
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

export interface CreateSaleInput {
  tenantId?: string;
  clientId?: string;
  currency?: string;
  source: {
    sourceType: SourceType;
    sourceId: string;
    sourceCode?: string | null;
  };
  items?: CreateSaleItemInput[];
  orderDiscount?: {
    type: string;
    value: number;
    reason?: string | null;
  };
}

export class CreateSaleCommand {
  constructor(public readonly input: CreateSaleInput) {}
}

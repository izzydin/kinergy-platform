import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleCurrentUser } from '../shared/sale-authorization';

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
  id?: string;
  idempotencyKey?: string;
  tenantId?: string;
  clientId?: string;
  currency?: string;
  currentUser?: SaleCurrentUser;
  source?: {
    sourceType: SourceType | SaleSourceType | string;
    sourceId: string;
    sourceCode?: string | null;
  } | null;
  allowWalkInWithoutSource?: boolean;
  expectedContext?: string;
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

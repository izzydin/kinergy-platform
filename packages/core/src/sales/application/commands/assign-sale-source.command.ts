import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleCurrentUser } from '../shared/sale-authorization';

export interface AssignSaleSourceInput {
  readonly saleId: string;
  readonly tenantId?: string;
  readonly currentUser?: SaleCurrentUser;
  readonly source: {
    readonly sourceType: SourceType | SaleSourceType | string;
    readonly sourceId: string;
    readonly sourceCode?: string | null;
  };
  readonly expectedContext?: string;
}

export class AssignSaleSourceCommand {
  constructor(public readonly input: AssignSaleSourceInput) {}
}

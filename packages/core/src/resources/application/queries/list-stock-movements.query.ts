import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import { StockMovementSortField } from '../../domain/inventory/repositories/inventory-item.repository.interface';

export interface ListStockMovementsInput {
  itemId?: string;
  tenantId?: string;
  movementType?: StockMovementType | StockMovementType[];
  recordedByUserId?: string;
  referenceId?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  page?: number;
  pageSize?: number;
  sortBy?: StockMovementSortField;
  sortOrder?: 'asc' | 'desc';
}

export class ListStockMovementsQuery {
  constructor(public readonly input: ListStockMovementsInput = {}) {
    Object.freeze(this);
  }
}

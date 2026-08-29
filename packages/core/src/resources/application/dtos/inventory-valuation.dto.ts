export interface InventoryValuationItemDTO {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  quantityOnHand: number;
  unit: string;
  unitCostAmount: number;
  unitCostCurrency: string;
  totalValueAmount: number;
  totalValueCurrency: string;
}

export interface InventoryValuationCategoryBreakdownDTO {
  totalValueAmount: number;
  itemCount: number;
  totalUnits: number;
}

export interface InventoryValuationDTO {
  totalValueAmount: number;
  currency: string;
  totalDistinctItems: number;
  totalQuantityUnits: number;
  calculatedAt: string;
  breakdownByCategory: Record<string, InventoryValuationCategoryBreakdownDTO>;
  items: InventoryValuationItemDTO[];
}

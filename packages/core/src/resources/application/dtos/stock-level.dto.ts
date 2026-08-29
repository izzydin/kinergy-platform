export interface StockLevelDTO {
  itemId: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  minimumStock: number;
  unit: string;
  status: string;
  isLowStock: boolean;
  isOutOfStock: boolean;
  category: string;
  version: number;
  updatedAt: string;
}

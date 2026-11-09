export interface InventoryItemDTO {
  id: string;
  tenantId?: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  minimumStock: number;
  quantityOnHand: number;
  purchaseCostAmount: number;
  purchaseCostCurrency: string;
  sellingPriceAmount: number;
  sellingPriceCurrency: string;
  // Canonical structured value representations
  sellingPrice?: {
    amount: number;
    currency: string;
  };
  unitCost?: {
    amount: number;
    currency: string;
  };
  // Aliases for consumer compatibility
  currentStock?: number;
  unitOfMeasure?: string;
  reorderThreshold?: number;
  status: string;
  locationRef?: {
    facilityId: string;
    roomRef?: string;
    binCode?: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

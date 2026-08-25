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

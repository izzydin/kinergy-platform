export interface AssetMaintenanceRecordDTO {
  id: string;
  assetId: string;
  serviceDate: Date;
  description: string;
  costAmount: number;
  costCurrency: string;
  cost?: {
    amount: number;
    currency: string;
  };
  performedBy: string;
  notes?: string;
  recordedByUserId: string;
  createdAt: Date;
}

export interface AssetMaintenanceRecordDTO {
  id: string;
  assetId: string;
  serviceDate: Date;
  description: string;
  costAmount: number;
  costCurrency: string;
  performedBy: string;
  notes?: string;
  recordedByUserId: string;
  createdAt: Date;
}

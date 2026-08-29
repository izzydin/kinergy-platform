import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetLocationDTO } from './asset-location.dto';
import { AssetHistoryEventDTO } from './asset-history-event.dto';
import { AssetMaintenanceRecordDTO } from './asset-maintenance-record.dto';

export interface FixedAssetDTO {
  id: string;
  tenantId?: string;
  assetTag: string;
  name: string;
  description?: string;
  category: AssetCategory;
  purchaseDate: Date;
  purchaseValueAmount: number;
  purchaseValueCurrency: string;
  currentEstimatedValueAmount: number;
  currentEstimatedValueCurrency: string;
  condition: AssetCondition;
  status: AssetStatus;
  location: AssetLocationDTO;
  notes?: string;
  historyEventsCount: number;
  maintenanceRecordsCount: number;
  recentHistoryEvents?: AssetHistoryEventDTO[];
  recentMaintenanceRecords?: AssetMaintenanceRecordDTO[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

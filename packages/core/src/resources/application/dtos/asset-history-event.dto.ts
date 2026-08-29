import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';

export interface AssetHistoryEventDTO {
  id: string;
  assetId: string;
  eventType: AssetHistoryEventType;
  description: string;
  details?: Record<string, unknown>;
  recordedByUserId: string;
  recordedAt: Date;
}

import { AssetDomainEvent } from './asset-domain.event';
import { AssetCategory } from '../enums/asset-category.enum';
import { AssetStatus } from '../enums/asset-status.enum';
import { AssetCondition } from '../enums/asset-condition.enum';

export interface AssetCreatedPayload {
  assetTag: string;
  name: string;
  category: AssetCategory;
  purchaseValueAmount: number;
  purchaseValueCurrency: string;
  condition: AssetCondition;
  status: AssetStatus;
  facilityId: string;
  actorId: string;
}

export class AssetCreatedDomainEvent extends AssetDomainEvent<AssetCreatedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetCreatedPayload,
    occurredAt?: Date,
  ) {
    super('AssetCreated', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

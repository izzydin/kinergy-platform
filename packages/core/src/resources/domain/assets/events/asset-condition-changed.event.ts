import { AssetDomainEvent } from './asset-domain.event';
import { AssetCondition } from '../enums/asset-condition.enum';

export interface AssetConditionChangedPayload {
  assetTag: string;
  priorCondition: AssetCondition;
  newCondition: AssetCondition;
  actorId: string;
  reason?: string;
}

export class AssetConditionChangedDomainEvent extends AssetDomainEvent<AssetConditionChangedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetConditionChangedPayload,
    occurredAt?: Date,
  ) {
    super('AssetConditionChanged', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

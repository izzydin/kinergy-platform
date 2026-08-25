import { AssetDomainEvent } from './asset-domain.event';

export interface AssetValuationUpdatedPayload {
  assetTag: string;
  priorEstimatedValueAmount: number;
  newEstimatedValueAmount: number;
  currency: string;
  actorId: string;
  reason?: string;
}

export class AssetValuationUpdatedDomainEvent extends AssetDomainEvent<AssetValuationUpdatedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetValuationUpdatedPayload,
    occurredAt?: Date,
  ) {
    super('AssetValuationUpdated', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

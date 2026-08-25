import { AssetDomainEvent } from './asset-domain.event';
import { AssetStatus } from '../enums/asset-status.enum';

export interface AssetStatusChangedPayload {
  assetTag: string;
  priorStatus: AssetStatus;
  newStatus: AssetStatus;
  actorId: string;
  reason?: string;
}

export class AssetStatusChangedDomainEvent extends AssetDomainEvent<AssetStatusChangedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetStatusChangedPayload,
    occurredAt?: Date,
  ) {
    super('AssetStatusChanged', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

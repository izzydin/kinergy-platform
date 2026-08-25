import { AssetDomainEvent } from './asset-domain.event';
import { AssetLocationProps } from '../value-objects/asset-location.vo';

export interface AssetTransferredPayload {
  assetTag: string;
  priorLocation: AssetLocationProps;
  newLocation: AssetLocationProps;
  actorId: string;
  reason?: string;
}

export class AssetTransferredDomainEvent extends AssetDomainEvent<AssetTransferredPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetTransferredPayload,
    occurredAt?: Date,
  ) {
    super('AssetTransferred', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

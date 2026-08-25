import { AssetDomainEvent } from './asset-domain.event';

export interface AssetRetiredPayload {
  assetTag: string;
  reason: string;
  actorId: string;
}

export class AssetRetiredDomainEvent extends AssetDomainEvent<AssetRetiredPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetRetiredPayload,
    occurredAt?: Date,
  ) {
    super('AssetRetired', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

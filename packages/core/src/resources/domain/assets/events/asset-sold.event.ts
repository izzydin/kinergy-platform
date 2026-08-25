import { AssetDomainEvent } from './asset-domain.event';

export interface AssetSoldPayload {
  assetTag: string;
  saleAmount: number;
  saleCurrency: string;
  reason: string;
  actorId: string;
}

export class AssetSoldDomainEvent extends AssetDomainEvent<AssetSoldPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetSoldPayload,
    occurredAt?: Date,
  ) {
    super('AssetSold', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

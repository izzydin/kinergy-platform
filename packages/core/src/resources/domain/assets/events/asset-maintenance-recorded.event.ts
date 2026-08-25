import { AssetDomainEvent } from './asset-domain.event';

export interface AssetMaintenanceRecordedPayload {
  assetTag: string;
  maintenanceRecordId: string;
  serviceDate: Date;
  description: string;
  costAmount: number;
  costCurrency: string;
  performedBy: string;
  actorId: string;
}

export class AssetMaintenanceRecordedDomainEvent extends AssetDomainEvent<AssetMaintenanceRecordedPayload> {
  constructor(
    aggregateId: string,
    aggregateVersion: number,
    payload: AssetMaintenanceRecordedPayload,
    occurredAt?: Date,
  ) {
    super('AssetMaintenanceRecorded', aggregateId, aggregateVersion, payload, occurredAt);
  }
}

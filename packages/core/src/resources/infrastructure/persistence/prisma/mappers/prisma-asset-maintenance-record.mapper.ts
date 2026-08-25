import {
  AssetMaintenanceRecord as PrismaAssetMaintenanceRecordModel,
  Prisma,
} from '@prisma/client';
import { AssetMaintenanceRecord } from '../../../../domain/assets/entities/asset-maintenance-record.entity';
import { MaintenanceRecordId } from '../../../../domain/assets/value-objects/maintenance-record-id.vo';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';

export class PrismaAssetMaintenanceRecordMapper {
  public static toDomain(raw: PrismaAssetMaintenanceRecordModel): AssetMaintenanceRecord {
    return AssetMaintenanceRecord.reconstitute({
      id: MaintenanceRecordId.create(raw.id),
      assetId: AssetId.create(raw.assetId),
      serviceDate: raw.serviceDate,
      description: raw.description,
      cost: Money.create(Number(raw.costAmount), raw.costCurrency),
      performedBy: raw.performedBy,
      notes: raw.notes ?? undefined,
      recordedByUserId: raw.recordedByUserId,
      createdAt: raw.createdAt,
    });
  }

  public static toPersistence(
    record: AssetMaintenanceRecord,
  ): Omit<PrismaAssetMaintenanceRecordModel, 'createdAt'> & { createdAt?: Date } {
    return {
      id: record.id.value,
      assetId: record.assetId.value,
      serviceDate: record.serviceDate,
      description: record.description,
      costAmount: new Prisma.Decimal(record.cost.amount),
      costCurrency: record.cost.currency,
      performedBy: record.performedBy,
      notes: record.notes ?? null,
      recordedByUserId: record.recordedByUserId,
      createdAt: record.createdAt,
    };
  }
}

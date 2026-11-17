import {
  FixedAsset as PrismaFixedAssetModel,
  AssetCategory as PrismaAssetCategory,
  AssetStatus as PrismaAssetStatus,
  AssetCondition as PrismaAssetCondition,
  AssetHistoryEvent as PrismaAssetHistoryEventModel,
  AssetMaintenanceRecord as PrismaAssetMaintenanceRecordModel,
  Prisma,
} from '@prisma/client';
import { FixedAsset } from '../../../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { AssetLocation } from '../../../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import { AssetCategory } from '../../../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../../../domain/assets/enums/asset-condition.enum';
import { PrismaAssetHistoryEventMapper } from './prisma-asset-history-event.mapper';
import { PrismaAssetMaintenanceRecordMapper } from './prisma-asset-maintenance-record.mapper';

export type PrismaFixedAssetWithRelations = PrismaFixedAssetModel & {
  historyEvents?: PrismaAssetHistoryEventModel[];
  maintenanceRecords?: PrismaAssetMaintenanceRecordModel[];
};

export class PrismaFixedAssetMapper {
  public static toDomain(raw: PrismaFixedAssetWithRelations): FixedAsset {
    const rawLoc =
      raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location)
        ? (raw.location as Record<string, unknown>)
        : {};

    const facilityId =
      typeof rawLoc.facilityId === 'string' && rawLoc.facilityId.trim().length > 0
        ? rawLoc.facilityId.trim()
        : typeof rawLoc.facility === 'string' && rawLoc.facility.trim().length > 0
          ? rawLoc.facility === 'Main Facility'
            ? 'fac-main'
            : rawLoc.facility.trim()
          : typeof rawLoc.facility_id === 'string' && rawLoc.facility_id.trim().length > 0
            ? rawLoc.facility_id.trim()
            : 'fac-main';

    const roomId =
      typeof rawLoc.roomId === 'string' && rawLoc.roomId.trim().length > 0
        ? rawLoc.roomId.trim()
        : typeof rawLoc.room === 'string' && rawLoc.room.trim().length > 0
          ? rawLoc.room.trim()
          : undefined;

    const zone =
      typeof rawLoc.zone === 'string' && rawLoc.zone.trim().length > 0
        ? rawLoc.zone.trim()
        : undefined;

    const description =
      typeof rawLoc.description === 'string' && rawLoc.description.trim().length > 0
        ? rawLoc.description.trim()
        : undefined;

    const location = AssetLocation.create({
      facilityId,
      roomId,
      zone,
      description,
    });
    const historyEvents = raw.historyEvents
      ? raw.historyEvents.map(PrismaAssetHistoryEventMapper.toDomain)
      : [];
    const maintenanceRecords = raw.maintenanceRecords
      ? raw.maintenanceRecords.map(PrismaAssetMaintenanceRecordMapper.toDomain)
      : [];

    return FixedAsset.reconstitute({
      id: AssetId.create(raw.id),
      tenantId: raw.tenantId ?? undefined,
      assetTag: raw.assetTag,
      name: raw.name,
      description: raw.description ?? undefined,
      category: raw.category as unknown as AssetCategory,
      purchaseDate: raw.purchaseDate,
      purchaseValue: Money.create(Number(raw.purchaseValueAmount), raw.purchaseValueCurrency),
      currentEstimatedValue: Money.create(
        Number(raw.currentEstimatedValueAmount),
        raw.currentEstimatedValueCurrency,
      ),
      condition: raw.condition as unknown as AssetCondition,
      status: raw.status as unknown as AssetStatus,
      location,
      notes: raw.notes ?? undefined,
      historyEvents,
      maintenanceRecords,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    asset: FixedAsset,
  ): Omit<PrismaFixedAssetModel, 'createdAt' | 'updatedAt'> {
    return {
      id: asset.id.value,
      tenantId: asset.tenantId ?? null,
      assetTag: asset.assetTag,
      name: asset.name,
      description: asset.description ?? null,
      category: asset.category as unknown as PrismaAssetCategory,
      purchaseDate: asset.purchaseDate,
      purchaseValueAmount: new Prisma.Decimal(asset.purchaseValue.amount),
      purchaseValueCurrency: asset.purchaseValue.currency,
      currentEstimatedValueAmount: new Prisma.Decimal(asset.currentEstimatedValue.amount),
      currentEstimatedValueCurrency: asset.currentEstimatedValue.currency,
      condition: asset.condition as unknown as PrismaAssetCondition,
      status: asset.status as unknown as PrismaAssetStatus,
      location: asset.location.getValue() as unknown as Prisma.JsonValue,
      notes: asset.notes ?? null,
      version: asset.version,
    };
  }
}

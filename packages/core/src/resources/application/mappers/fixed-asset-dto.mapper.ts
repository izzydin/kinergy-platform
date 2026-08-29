import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetHistoryEvent } from '../../domain/assets/entities/asset-history-event.entity';
import { AssetMaintenanceRecord } from '../../domain/assets/entities/asset-maintenance-record.entity';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { AssetLocationDTO } from '../dtos/asset-location.dto';
import { AssetHistoryEventDTO } from '../dtos/asset-history-event.dto';
import { AssetMaintenanceRecordDTO } from '../dtos/asset-maintenance-record.dto';

export class FixedAssetDtoMapper {
  public static toDTO(asset: FixedAsset, includeNested = true): FixedAssetDTO {
    const locationDto: AssetLocationDTO = {
      facilityId: asset.location.facilityId,
      roomId: asset.location.roomId,
      zone: asset.location.zone,
      description: asset.location.description,
      formatted: asset.location.toString(),
    };

    return {
      id: asset.id.value,
      tenantId: asset.tenantId,
      assetTag: asset.assetTag,
      name: asset.name,
      description: asset.description,
      category: asset.category,
      purchaseDate: asset.purchaseDate,
      purchaseValueAmount: asset.purchaseValue.amount,
      purchaseValueCurrency: asset.purchaseValue.currency,
      currentEstimatedValueAmount: asset.currentEstimatedValue.amount,
      currentEstimatedValueCurrency: asset.currentEstimatedValue.currency,
      condition: asset.condition,
      status: asset.status,
      location: locationDto,
      notes: asset.notes,
      historyEventsCount: asset.historyEvents.length,
      maintenanceRecordsCount: asset.maintenanceRecords.length,
      recentHistoryEvents: includeNested
        ? asset.historyEvents.slice(-10).reverse().map(FixedAssetDtoMapper.toHistoryDTO)
        : undefined,
      recentMaintenanceRecords: includeNested
        ? asset.maintenanceRecords.slice(-10).reverse().map(FixedAssetDtoMapper.toMaintenanceDTO)
        : undefined,
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  public static toHistoryDTO(event: AssetHistoryEvent): AssetHistoryEventDTO {
    return {
      id: event.id.value,
      assetId: event.assetId.value,
      eventType: event.eventType,
      description: event.description,
      details: event.details,
      recordedByUserId: event.recordedByUserId,
      recordedAt: event.recordedAt,
    };
  }

  public static toMaintenanceDTO(record: AssetMaintenanceRecord): AssetMaintenanceRecordDTO {
    return {
      id: record.id.value,
      assetId: record.assetId.value,
      serviceDate: record.serviceDate,
      description: record.description,
      costAmount: record.cost.amount,
      costCurrency: record.cost.currency,
      performedBy: record.performedBy,
      notes: record.notes,
      recordedByUserId: record.recordedByUserId,
      createdAt: record.createdAt,
    };
  }
}

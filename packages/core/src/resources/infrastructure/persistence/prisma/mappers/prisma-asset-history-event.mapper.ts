import {
  AssetHistoryEvent as PrismaAssetHistoryEventModel,
  AssetHistoryEventType as PrismaAssetHistoryEventType,
  Prisma,
} from '@prisma/client';
import { AssetHistoryEvent } from '../../../../domain/assets/entities/asset-history-event.entity';
import { AssetHistoryId } from '../../../../domain/assets/value-objects/asset-history-id.vo';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { AssetHistoryEventType } from '../../../../domain/assets/enums/asset-history-event-type.enum';

export class PrismaAssetHistoryEventMapper {
  public static toDomain(raw: PrismaAssetHistoryEventModel): AssetHistoryEvent {
    return AssetHistoryEvent.reconstitute({
      id: AssetHistoryId.create(raw.id),
      assetId: AssetId.create(raw.assetId),
      eventType: raw.eventType as unknown as AssetHistoryEventType,
      description: raw.description,
      details: raw.details ? (raw.details as Record<string, unknown>) : undefined,
      recordedByUserId: raw.recordedByUserId,
      recordedAt: raw.recordedAt,
    });
  }

  public static toPersistence(event: AssetHistoryEvent): PrismaAssetHistoryEventModel {
    return {
      id: event.id.value,
      assetId: event.assetId.value,
      eventType: event.eventType as unknown as PrismaAssetHistoryEventType,
      description: event.description,
      details: event.details ? (event.details as unknown as Prisma.JsonValue) : null,
      recordedByUserId: event.recordedByUserId,
      recordedAt: event.recordedAt,
    };
  }
}

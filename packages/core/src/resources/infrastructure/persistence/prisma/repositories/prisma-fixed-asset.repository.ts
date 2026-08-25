import {
  PrismaClient,
  AssetCategory as PrismaAssetCategory,
  AssetStatus as PrismaAssetStatus,
  Prisma,
} from '@prisma/client';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
} from '../../../../domain/assets/repositories/fixed-asset.repository.interface';
import { FixedAsset } from '../../../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { OptimisticLockException } from '../../../../domain/inventory/exceptions/optimistic-lock.exception';
import { PrismaFixedAssetMapper } from '../mappers/prisma-fixed-asset.mapper';
import { PrismaAssetHistoryEventMapper } from '../mappers/prisma-asset-history-event.mapper';
import { PrismaAssetMaintenanceRecordMapper } from '../mappers/prisma-asset-maintenance-record.mapper';

export class PrismaFixedAssetRepository implements FixedAssetRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async save(asset: FixedAsset): Promise<void> {
    const data = PrismaFixedAssetMapper.toPersistence(asset);
    const historyData = asset.historyEvents.map(PrismaAssetHistoryEventMapper.toPersistence);
    const maintenanceData = asset.maintenanceRecords.map(
      PrismaAssetMaintenanceRecordMapper.toPersistence,
    );

    await this.prisma.$transaction(async (tx) => {
      if (asset.version === 1) {
        // Initial create
        await tx.fixedAsset.upsert({
          where: { id: data.id },
          create: {
            id: data.id,
            tenantId: data.tenantId,
            assetTag: data.assetTag,
            name: data.name,
            description: data.description,
            category: data.category,
            purchaseDate: data.purchaseDate,
            purchaseValueAmount: data.purchaseValueAmount,
            purchaseValueCurrency: data.purchaseValueCurrency,
            currentEstimatedValueAmount: data.currentEstimatedValueAmount,
            currentEstimatedValueCurrency: data.currentEstimatedValueCurrency,
            condition: data.condition,
            status: data.status,
            location: data.location as Prisma.InputJsonValue,
            notes: data.notes,
            version: 1,
          },
          update: {
            tenantId: data.tenantId,
            assetTag: data.assetTag,
            name: data.name,
            description: data.description,
            category: data.category,
            purchaseDate: data.purchaseDate,
            purchaseValueAmount: data.purchaseValueAmount,
            purchaseValueCurrency: data.purchaseValueCurrency,
            currentEstimatedValueAmount: data.currentEstimatedValueAmount,
            currentEstimatedValueCurrency: data.currentEstimatedValueCurrency,
            condition: data.condition,
            status: data.status,
            location: data.location as Prisma.InputJsonValue,
            notes: data.notes,
            version: 1,
          },
        });
      } else {
        // OCC check against prior version
        const priorVersion = asset.version - 1;
        const result = await tx.fixedAsset.updateMany({
          where: {
            id: data.id,
            version: priorVersion,
          },
          data: {
            tenantId: data.tenantId,
            assetTag: data.assetTag,
            name: data.name,
            description: data.description,
            category: data.category,
            purchaseDate: data.purchaseDate,
            purchaseValueAmount: data.purchaseValueAmount,
            purchaseValueCurrency: data.purchaseValueCurrency,
            currentEstimatedValueAmount: data.currentEstimatedValueAmount,
            currentEstimatedValueCurrency: data.currentEstimatedValueCurrency,
            condition: data.condition,
            status: data.status,
            location: data.location as Prisma.InputJsonValue,
            notes: data.notes,
            version: data.version,
          },
        });

        if (result.count === 0) {
          throw new OptimisticLockException('FixedAsset', data.id, priorVersion);
        }
      }

      // Persist append-only history events
      for (const event of historyData) {
        await tx.assetHistoryEvent.upsert({
          where: { id: event.id },
          create: {
            id: event.id,
            assetId: event.assetId,
            eventType: event.eventType,
            description: event.description,
            details: event.details as Prisma.InputJsonValue,
            recordedByUserId: event.recordedByUserId,
            recordedAt: event.recordedAt,
          },
          update: {},
        });
      }

      // Persist append-only maintenance records
      for (const record of maintenanceData) {
        await tx.assetMaintenanceRecord.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            assetId: record.assetId,
            serviceDate: record.serviceDate,
            description: record.description,
            costAmount: record.costAmount,
            costCurrency: record.costCurrency,
            performedBy: record.performedBy,
            notes: record.notes,
            recordedByUserId: record.recordedByUserId,
            createdAt: record.createdAt,
          },
          update: {},
        });
      }
    });
  }

  async findById(id: AssetId): Promise<FixedAsset | null> {
    const raw = await this.prisma.fixedAsset.findUnique({
      where: { id: id.value },
      include: {
        historyEvents: {
          orderBy: { recordedAt: 'asc' },
        },
        maintenanceRecords: {
          orderBy: { serviceDate: 'asc' },
        },
      },
    });

    return raw ? PrismaFixedAssetMapper.toDomain(raw) : null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const where: Prisma.FixedAssetWhereInput = {
      assetTag: assetTag.trim().toUpperCase(),
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const raw = await this.prisma.fixedAsset.findFirst({
      where,
      include: {
        historyEvents: {
          orderBy: { recordedAt: 'asc' },
        },
        maintenanceRecords: {
          orderBy: { serviceDate: 'asc' },
        },
      },
    });

    return raw ? PrismaFixedAssetMapper.toDomain(raw) : null;
  }

  async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    const where = this.buildWhereClause(filter);

    const list = await this.prisma.fixedAsset.findMany({
      where,
      include: {
        historyEvents: {
          orderBy: { recordedAt: 'asc' },
        },
        maintenanceRecords: {
          orderBy: { serviceDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: filter?.limit,
      skip: filter?.offset,
    });

    return list.map(PrismaFixedAssetMapper.toDomain);
  }

  async count(filter?: FixedAssetFilterOptions): Promise<number> {
    const where = this.buildWhereClause(filter);
    return this.prisma.fixedAsset.count({ where });
  }

  async delete(id: AssetId): Promise<void> {
    await this.prisma.fixedAsset.delete({
      where: { id: id.value },
    });
  }

  private buildWhereClause(filter?: FixedAssetFilterOptions): Prisma.FixedAssetWhereInput {
    const where: Prisma.FixedAssetWhereInput = {};

    if (!filter) {
      return where;
    }

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }
    if (filter.category) {
      where.category = filter.category as unknown as PrismaAssetCategory;
    }
    if (filter.status) {
      where.status = filter.status as unknown as PrismaAssetStatus;
    }
    if (filter.facilityId) {
      where.location = {
        path: ['facilityId'],
        equals: filter.facilityId,
      };
    }
    if (filter.search) {
      const query = filter.search.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { assetTag: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

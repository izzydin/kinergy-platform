import {
  PrismaClient,
  AssetCategory as PrismaAssetCategory,
  AssetStatus as PrismaAssetStatus,
  AssetCondition as PrismaAssetCondition,
  Prisma,
} from '@prisma/client';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
  FixedAssetOverviewMetrics,
  FixedAssetOverviewFilter,
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
    const orderBy = this.buildOrderByClause(filter);

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
      orderBy,
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

  async getOverviewMetrics(filter?: FixedAssetOverviewFilter): Promise<FixedAssetOverviewMetrics> {
    const where: Prisma.FixedAssetWhereInput = {};
    if (filter?.tenantId) {
      where.tenantId = filter.tenantId;
    }
    if (filter?.facilityId) {
      where.location = {
        path: ['facilityId'],
        equals: filter.facilityId,
      };
    }
    if (!filter?.includeDecommissioned) {
      where.status = {
        in: [
          PrismaAssetStatus.ACTIVE,
          PrismaAssetStatus.UNDER_MAINTENANCE,
          PrismaAssetStatus.DAMAGED,
        ],
      };
    }

    // High-performance database aggregation via groupBy when available
    if (typeof this.prisma.fixedAsset?.groupBy === 'function') {
      const groups = await this.prisma.fixedAsset.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { currentEstimatedValueAmount: true },
      });

      let totalCount = 0;
      let activeCount = 0;
      let maintenanceCount = 0;
      let damagedCount = 0;
      let retiredCount = 0;
      let totalCarryingValueCents = 0;

      for (const group of groups) {
        const count = group._count?.id ?? 0;
        totalCount += count;
        const sumDecimal = group._sum?.currentEstimatedValueAmount;
        const sumAmount = sumDecimal ? Number(sumDecimal) : 0;
        const sumCents = Math.round(sumAmount * 100);

        switch (group.status) {
          case PrismaAssetStatus.ACTIVE:
            activeCount = count;
            totalCarryingValueCents += sumCents;
            break;
          case PrismaAssetStatus.UNDER_MAINTENANCE:
            maintenanceCount = count;
            totalCarryingValueCents += sumCents;
            break;
          case PrismaAssetStatus.DAMAGED:
            damagedCount = count;
            totalCarryingValueCents += sumCents;
            break;
          case PrismaAssetStatus.RETIRED:
            retiredCount = count;
            // Per ADR-0097, RETIRED assets do not contribute to carrying value
            break;
          case PrismaAssetStatus.SOLD:
            // SOLD assets do not contribute to carrying value
            break;
        }
      }

      return {
        totalCount,
        activeCount,
        maintenanceCount,
        damagedCount,
        retiredCount,
        totalCarryingValueCents,
      };
    }

    // Fallback: minimal column select without loading relations or history events
    const assets = await this.prisma.fixedAsset.findMany({
      where,
      select: {
        status: true,
        currentEstimatedValueAmount: true,
      },
    });

    const totalCount = assets.length;
    let activeCount = 0;
    let maintenanceCount = 0;
    let damagedCount = 0;
    let retiredCount = 0;
    let totalCarryingValueCents = 0;

    for (const asset of assets) {
      const amount = Number(asset.currentEstimatedValueAmount);
      const cents = Math.round(amount * 100);

      switch (asset.status) {
        case PrismaAssetStatus.ACTIVE:
          activeCount += 1;
          totalCarryingValueCents += cents;
          break;
        case PrismaAssetStatus.UNDER_MAINTENANCE:
          maintenanceCount += 1;
          totalCarryingValueCents += cents;
          break;
        case PrismaAssetStatus.DAMAGED:
          damagedCount += 1;
          totalCarryingValueCents += cents;
          break;
        case PrismaAssetStatus.RETIRED:
          retiredCount += 1;
          break;
        case PrismaAssetStatus.SOLD:
          break;
      }
    }

    return {
      totalCount,
      activeCount,
      maintenanceCount,
      damagedCount,
      retiredCount,
      totalCarryingValueCents,
    };
  }

  private buildWhereClause(filter?: FixedAssetFilterOptions): Prisma.FixedAssetWhereInput {
    const where: Prisma.FixedAssetWhereInput = {};

    if (!filter) {
      // Default: operational assets only
      where.status = {
        in: [
          PrismaAssetStatus.ACTIVE,
          PrismaAssetStatus.UNDER_MAINTENANCE,
          PrismaAssetStatus.DAMAGED,
        ],
      };
      return where;
    }

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }

    if (filter.category) {
      if (Array.isArray(filter.category)) {
        where.category = { in: filter.category as unknown as PrismaAssetCategory[] };
      } else {
        where.category = filter.category as unknown as PrismaAssetCategory;
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        where.status = { in: filter.status as unknown as PrismaAssetStatus[] };
      } else {
        where.status = filter.status as unknown as PrismaAssetStatus;
      }
    } else if (!filter.includeDecommissioned) {
      // Default exclusion of RETIRED and SOLD
      where.status = {
        in: [
          PrismaAssetStatus.ACTIVE,
          PrismaAssetStatus.UNDER_MAINTENANCE,
          PrismaAssetStatus.DAMAGED,
        ],
      };
    }

    if (filter.condition) {
      if (Array.isArray(filter.condition)) {
        where.condition = { in: filter.condition as unknown as PrismaAssetCondition[] };
      } else {
        where.condition = filter.condition as unknown as PrismaAssetCondition;
      }
    }

    if (filter.facilityId && filter.roomId) {
      where.location = {
        path: ['facilityId'],
        equals: filter.facilityId,
      };
      where.AND = [
        {
          location: {
            path: ['roomId'],
            equals: filter.roomId,
          },
        },
      ];
    } else if (filter.facilityId) {
      where.location = {
        path: ['facilityId'],
        equals: filter.facilityId,
      };
    } else if (filter.roomId) {
      where.location = {
        path: ['roomId'],
        equals: filter.roomId,
      };
    }

    if (filter.search) {
      const query = filter.search.trim().slice(0, 100);
      if (query.length > 0) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { assetTag: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }
    }

    return where;
  }

  private buildOrderByClause(
    filter?: FixedAssetFilterOptions,
  ): Prisma.FixedAssetOrderByWithRelationInput[] {
    const sortField = filter?.sortBy ?? 'name';
    const sortOrder = filter?.sortOrder === 'desc' ? 'desc' : 'asc';

    const sortMap: Record<string, keyof Prisma.FixedAssetOrderByWithRelationInput> = {
      name: 'name',
      assetTag: 'assetTag',
      category: 'category',
      status: 'status',
      condition: 'condition',
      purchaseDate: 'purchaseDate',
      purchaseValueAmount: 'purchaseValueAmount',
      currentEstimatedValueAmount: 'currentEstimatedValueAmount',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    };

    const prismaField = sortMap[sortField] ?? 'name';

    // Primary sort key + stable tie-breaker id
    return [{ [prismaField]: sortOrder }, { id: 'asc' }];
  }
}

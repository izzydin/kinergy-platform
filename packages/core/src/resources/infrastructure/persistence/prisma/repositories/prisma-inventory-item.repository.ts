import {
  PrismaClient,
  InventoryCategory as PrismaInventoryCategory,
  InventoryItemStatus as PrismaInventoryItemStatus,
  StockMovementType as PrismaStockMovementType,
  Prisma,
} from '@prisma/client';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
  FindStockMovementsFilter,
  InventoryOverviewMetrics,
  InventoryOverviewFilter,
} from '../../../../domain/inventory/repositories/inventory-item.repository.interface';
import { StockMovement } from '../../../../domain/inventory/entities/stock-movement.entity';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { OptimisticLockException } from '../../../../domain/inventory/exceptions/optimistic-lock.exception';
import { PrismaInventoryItemMapper } from '../mappers/prisma-inventory-item.mapper';
import { PrismaStockMovementMapper } from '../mappers/prisma-stock-movement.mapper';

export class PrismaInventoryItemRepository implements InventoryItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(item: InventoryItem): Promise<void> {
    const data = PrismaInventoryItemMapper.toPersistence(item);
    const movementsData = item.movements.map(PrismaStockMovementMapper.toPersistence);

    await this.prisma.$transaction(async (tx) => {
      if (item.version === 1) {
        // Initial insert / create
        await tx.inventoryItem.upsert({
          where: { id: data.id },
          create: {
            id: data.id,
            tenantId: data.tenantId,
            sku: data.sku,
            name: data.name,
            description: data.description,
            category: data.category,
            unit: data.unit,
            minimumStock: data.minimumStock,
            quantityOnHand: data.quantityOnHand,
            purchaseCostAmount: data.purchaseCostAmount,
            purchaseCostCurrency: data.purchaseCostCurrency,
            sellingPriceAmount: data.sellingPriceAmount,
            sellingPriceCurrency: data.sellingPriceCurrency,
            status: data.status,
            locationRef: data.locationRef
              ? (data.locationRef as Prisma.InputJsonValue)
              : Prisma.DbNull,
            version: 1,
          },
          update: {
            tenantId: data.tenantId,
            sku: data.sku,
            name: data.name,
            description: data.description,
            category: data.category,
            unit: data.unit,
            minimumStock: data.minimumStock,
            quantityOnHand: data.quantityOnHand,
            purchaseCostAmount: data.purchaseCostAmount,
            purchaseCostCurrency: data.purchaseCostCurrency,
            sellingPriceAmount: data.sellingPriceAmount,
            sellingPriceCurrency: data.sellingPriceCurrency,
            status: data.status,
            locationRef: data.locationRef
              ? (data.locationRef as Prisma.InputJsonValue)
              : Prisma.DbNull,
            version: 1,
          },
        });
      } else {
        // Optimistic Concurrency Control: verify prior version before updating
        const priorVersion = item.version - 1;
        const result = await tx.inventoryItem.updateMany({
          where: {
            id: data.id,
            version: priorVersion,
          },
          data: {
            tenantId: data.tenantId,
            sku: data.sku,
            name: data.name,
            description: data.description,
            category: data.category,
            unit: data.unit,
            minimumStock: data.minimumStock,
            quantityOnHand: data.quantityOnHand,
            purchaseCostAmount: data.purchaseCostAmount,
            purchaseCostCurrency: data.purchaseCostCurrency,
            sellingPriceAmount: data.sellingPriceAmount,
            sellingPriceCurrency: data.sellingPriceCurrency,
            status: data.status,
            locationRef: data.locationRef
              ? (data.locationRef as Prisma.InputJsonValue)
              : Prisma.DbNull,
            version: data.version,
          },
        });

        if (result.count === 0) {
          throw new OptimisticLockException('InventoryItem', data.id, priorVersion);
        }
      }

      // 2. Persist append-only StockMovements that don't exist yet
      if (movementsData.length > 0) {
        for (const mv of movementsData) {
          await tx.stockMovement.upsert({
            where: { id: mv.id },
            create: {
              id: mv.id,
              inventoryItemId: mv.inventoryItemId,
              movementType: mv.movementType,
              quantityDelta: mv.quantityDelta,
              balanceAfter: mv.balanceAfter,
              unitCostAmount: mv.unitCostAmount,
              unitCostCurrency: mv.unitCostCurrency,
              reason: mv.reason,
              recordedByUserId: mv.recordedByUserId,
              referenceId: mv.referenceId,
              recordedAt: mv.recordedAt,
            },
            update: {
              // Stock movements are immutable once created
            },
          });
        }
      }
    });
  }

  async findById(id: string): Promise<InventoryItem | null> {
    const raw = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        movements: {
          orderBy: { recordedAt: 'asc' },
        },
      },
    });
    return raw ? PrismaInventoryItemMapper.toDomain(raw) : null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    const where: Prisma.InventoryItemWhereInput = { sku: sku.trim().toUpperCase() };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const raw = await this.prisma.inventoryItem.findFirst({
      where,
      include: {
        movements: {
          orderBy: { recordedAt: 'asc' },
        },
      },
    });
    return raw ? PrismaInventoryItemMapper.toDomain(raw) : null;
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    const where = this.buildWhereClause(filter);
    const orderBy = this.buildOrderByClause(filter);

    // If stockStatus or lowStockOnly requires cross-column evaluation (LOW_STOCK or IN_STOCK), fetch and filter
    const needsCrossColumnFilter =
      filter?.stockStatus === 'LOW_STOCK' ||
      filter?.stockStatus === 'IN_STOCK' ||
      filter?.lowStockOnly;

    if (needsCrossColumnFilter) {
      const list = await this.prisma.inventoryItem.findMany({
        where,
        include: {
          movements: {
            orderBy: { recordedAt: 'asc' },
          },
        },
        orderBy,
      });

      let domainItems = list.map(PrismaInventoryItemMapper.toDomain);

      if (filter?.stockStatus === 'LOW_STOCK') {
        domainItems = domainItems.filter((item) => item.isLowStock() && !item.isOutOfStock());
      } else if (filter?.stockStatus === 'IN_STOCK') {
        domainItems = domainItems.filter((item) => !item.isLowStock());
      } else if (filter?.lowStockOnly) {
        domainItems = domainItems.filter((item) => item.isLowStock());
      }

      const offset = filter?.offset ?? 0;
      const limit = filter?.limit ?? domainItems.length;
      return domainItems.slice(offset, offset + limit);
    }

    const list = await this.prisma.inventoryItem.findMany({
      where,
      include: {
        movements: {
          orderBy: { recordedAt: 'asc' },
        },
      },
      orderBy,
      take: filter?.limit,
      skip: filter?.offset,
    });

    return list.map(PrismaInventoryItemMapper.toDomain);
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const needsCrossColumnFilter =
      filter?.stockStatus === 'LOW_STOCK' ||
      filter?.stockStatus === 'IN_STOCK' ||
      filter?.lowStockOnly;

    const where = this.buildWhereClause(filter);

    if (needsCrossColumnFilter) {
      // Direct minimal column projection without loading full aggregate models or movements
      const items = await this.prisma.inventoryItem.findMany({
        where,
        select: {
          quantityOnHand: true,
          minimumStock: true,
        },
      });

      return items.filter((item) => {
        const qty = Number(item.quantityOnHand);
        const min = Number(item.minimumStock);
        if (filter?.lowStockOnly || filter?.stockStatus === 'LOW_STOCK') {
          return qty <= min;
        }
        if (filter?.stockStatus === 'IN_STOCK') {
          return qty > min;
        }
        return true;
      }).length;
    }

    return this.prisma.inventoryItem.count({ where });
  }

  async getOverviewMetrics(filter?: InventoryOverviewFilter): Promise<InventoryOverviewMetrics> {
    const where: Prisma.InventoryItemWhereInput = {};

    if (filter?.tenantId) {
      where.tenantId = filter.tenantId;
    }

    if (filter?.category) {
      if (Array.isArray(filter.category)) {
        where.category = {
          in: filter.category as unknown as PrismaInventoryCategory[],
        };
      } else {
        where.category = filter.category as unknown as PrismaInventoryCategory;
      }
    }

    if (!filter?.includeArchived) {
      where.status = {
        in: [PrismaInventoryItemStatus.ACTIVE, PrismaInventoryItemStatus.INACTIVE],
      };
    }

    // High-performance raw SQL aggregation in PostgreSQL when available
    if (typeof this.prisma.$queryRaw === 'function') {
      try {
        const conditions: Prisma.Sql[] = [];
        if (filter?.tenantId) {
          conditions.push(Prisma.sql`tenant_id = ${filter.tenantId}`);
        }
        if (filter?.category) {
          if (Array.isArray(filter.category)) {
            conditions.push(
              Prisma.sql`category::text IN (${Prisma.join(
                filter.category.map((c) => Prisma.sql`${c}`),
              )})`,
            );
          } else {
            conditions.push(Prisma.sql`category::text = ${filter.category}`);
          }
        }
        if (!filter?.includeArchived) {
          conditions.push(Prisma.sql`status::text IN ('ACTIVE', 'INACTIVE')`);
        }

        const whereSql =
          conditions.length > 0
            ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
            : Prisma.empty;

        const results = await this.prisma.$queryRaw<
          Array<{
            totalItems: number | bigint;
            totalQuantity: number | string;
            totalValuationCents: number | bigint | string;
            lowStockCount: number | bigint;
            outOfStockCount: number | bigint;
          }>
        >`
          SELECT
            COUNT(*)::int AS "totalItems",
            COALESCE(SUM(quantity_on_hand), 0)::float AS "totalQuantity",
            COALESCE(SUM(ROUND(quantity_on_hand * purchase_cost_amount * 100)), 0)::bigint AS "totalValuationCents",
            COUNT(CASE WHEN quantity_on_hand <= minimum_stock THEN 1 END)::int AS "lowStockCount",
            COUNT(CASE WHEN quantity_on_hand = 0 THEN 1 END)::int AS "outOfStockCount"
          FROM inventory_items
          ${whereSql}
        `;

        const row = results?.[0];
        if (row) {
          return {
            totalItems: Number(row.totalItems),
            totalQuantity: Number(row.totalQuantity),
            totalValuationCents: Number(row.totalValuationCents),
            lowStockCount: Number(row.lowStockCount),
            outOfStockCount: Number(row.outOfStockCount),
          };
        }
      } catch {
        // Fall through to minimal select projection path if raw query is not supported in the active context
      }
    }

    // Fallback: minimal scalar projection without relations or movements
    const items = await this.prisma.inventoryItem.findMany({
      where,
      select: {
        quantityOnHand: true,
        purchaseCostAmount: true,
        minimumStock: true,
      },
    });

    let totalQuantity = 0;
    let totalValuationCents = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const item of items) {
      const qty = Number(item.quantityOnHand);
      const cost = Number(item.purchaseCostAmount);
      const min = Number(item.minimumStock);

      totalQuantity += qty;
      totalValuationCents += Math.round(qty * cost * 100);
      if (qty <= min) {
        lowStockCount += 1;
      }
      if (qty === 0) {
        outOfStockCount += 1;
      }
    }

    return {
      totalItems: items.length,
      totalQuantity,
      totalValuationCents,
      lowStockCount,
      outOfStockCount,
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.inventoryItem.delete({
      where: { id },
    });
  }

  private buildOrderByClause(
    filter?: FindInventoryItemsFilter,
  ): Prisma.InventoryItemOrderByWithRelationInput[] {
    const sortOrder: Prisma.SortOrder = filter?.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = filter?.sortBy ?? 'name';

    const orderMap: Record<string, Prisma.InventoryItemOrderByWithRelationInput> = {
      name: { name: sortOrder },
      sku: { sku: sortOrder },
      category: { category: sortOrder },
      quantityOnHand: { quantityOnHand: sortOrder },
      sellingPrice: { sellingPriceAmount: sortOrder },
      createdAt: { createdAt: sortOrder },
      updatedAt: { updatedAt: sortOrder },
    };

    const primaryOrder = orderMap[sortBy] || { name: 'asc' };
    return [primaryOrder, { id: 'asc' }];
  }

  private buildWhereClause(filter?: FindInventoryItemsFilter): Prisma.InventoryItemWhereInput {
    const where: Prisma.InventoryItemWhereInput = {};

    if (!filter) {
      where.status = {
        in: [PrismaInventoryItemStatus.ACTIVE, PrismaInventoryItemStatus.INACTIVE],
      };
      return where;
    }

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }

    if (filter.category) {
      if (Array.isArray(filter.category)) {
        where.category = {
          in: filter.category as unknown as PrismaInventoryCategory[],
        };
      } else {
        where.category = filter.category as unknown as PrismaInventoryCategory;
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        where.status = {
          in: filter.status as unknown as PrismaInventoryItemStatus[],
        };
      } else {
        where.status = filter.status as unknown as PrismaInventoryItemStatus;
      }
    } else if (!filter.includeArchived) {
      where.status = {
        in: [PrismaInventoryItemStatus.ACTIVE, PrismaInventoryItemStatus.INACTIVE],
      };
    }

    if (filter.stockStatus === 'OUT_OF_STOCK') {
      where.quantityOnHand = { equals: 0 };
    }

    if (filter.search) {
      const query = filter.search.trim().slice(0, 100);
      if (query.length > 0) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }
    }

    return where;
  }

  async findMovements(filter?: FindStockMovementsFilter): Promise<StockMovement[]> {
    const where = this.buildMovementsWhereClause(filter);
    const orderBy = this.buildMovementsOrderByClause(filter);

    const list = await this.prisma.stockMovement.findMany({
      where,
      orderBy,
      take: filter?.limit,
      skip: filter?.offset,
    });

    return list.map(PrismaStockMovementMapper.toDomain);
  }

  async countMovements(filter?: FindStockMovementsFilter): Promise<number> {
    const where = this.buildMovementsWhereClause(filter);
    return this.prisma.stockMovement.count({ where });
  }

  private buildMovementsOrderByClause(
    filter?: FindStockMovementsFilter,
  ): Prisma.StockMovementOrderByWithRelationInput[] {
    const sortOrder: Prisma.SortOrder = filter?.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = filter?.sortBy ?? 'recordedAt';

    const orderMap: Record<string, Prisma.StockMovementOrderByWithRelationInput> = {
      recordedAt: { recordedAt: sortOrder },
      quantityDelta: { quantityDelta: sortOrder },
      balanceAfter: { balanceAfter: sortOrder },
    };

    const primary = orderMap[sortBy] || { recordedAt: 'desc' };
    return [primary, { id: 'desc' }];
  }

  private buildMovementsWhereClause(
    filter?: FindStockMovementsFilter,
  ): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = {};

    if (!filter) {
      return where;
    }

    if (filter.itemId) {
      where.inventoryItemId = filter.itemId;
    }

    if (filter.tenantId) {
      where.item = {
        tenantId: filter.tenantId,
      };
    }

    if (filter.movementType) {
      if (Array.isArray(filter.movementType)) {
        where.movementType = {
          in: filter.movementType as unknown as PrismaStockMovementType[],
        };
      } else {
        where.movementType = filter.movementType as unknown as PrismaStockMovementType;
      }
    }

    if (filter.recordedByUserId) {
      where.recordedByUserId = filter.recordedByUserId;
    }

    if (filter.referenceId) {
      where.referenceId = filter.referenceId;
    }

    if (filter.fromDate || filter.toDate) {
      where.recordedAt = {};
      if (filter.fromDate) {
        where.recordedAt.gte = filter.fromDate;
      }
      if (filter.toDate) {
        where.recordedAt.lte = filter.toDate;
      }
    }

    return where;
  }
}

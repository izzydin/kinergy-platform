import {
  PrismaClient,
  InventoryCategory as PrismaInventoryCategory,
  InventoryItemStatus as PrismaInventoryItemStatus,
  Prisma,
} from '@prisma/client';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../../../domain/inventory/repositories/inventory-item.repository.interface';
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

    const list = await this.prisma.inventoryItem.findMany({
      where,
      include: {
        movements: {
          orderBy: { recordedAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: filter?.limit,
      skip: filter?.offset,
    });

    return list.map(PrismaInventoryItemMapper.toDomain);
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const where = this.buildWhereClause(filter);
    return this.prisma.inventoryItem.count({ where });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.inventoryItem.delete({
      where: { id },
    });
  }

  private buildWhereClause(filter?: FindInventoryItemsFilter): Prisma.InventoryItemWhereInput {
    const where: Prisma.InventoryItemWhereInput = {};

    if (!filter) {
      return where;
    }

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }
    if (filter.category) {
      where.category = filter.category as unknown as PrismaInventoryCategory;
    }
    if (filter.status) {
      where.status = filter.status as unknown as PrismaInventoryItemStatus;
    }
    if (filter.search) {
      const query = filter.search.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

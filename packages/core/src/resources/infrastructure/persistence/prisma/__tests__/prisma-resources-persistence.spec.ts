import { PrismaInventoryItemMapper, PrismaInventoryItemRepository } from '../index';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../../../domain/inventory/enums/stock-movement-type.enum';
import { PrismaClient, Prisma } from '@prisma/client';

type MockPrismaClient = {
  $transaction: jest.Mock;
  inventoryItem: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
  };
  stockMovement: {
    upsert: jest.Mock;
  };
};

describe('Phase 6.1: Consumable Inventory Prisma Persistence & Mapping', () => {
  const actorId = 'usr_clinician_789';

  describe('1. InventoryItem & StockMovement Mapper Fidelity', () => {
    it('accurately maps domain aggregate to Prisma persistence model and reconstitutes without data loss', () => {
      const item = InventoryItem.create({
        sku: 'MED-TAPE-PRO',
        name: 'Elastic Therapeutic Tape Pro (Blue)',
        description: 'Waterproof kinesiology tape',
        category: InventoryCategory.THERAPY_CONSUMABLES,
        unit: UnitOfMeasure.ROLLS,
        minimumStock: 10,
        initialStock: 25,
        purchaseCost: { amount: 9.99, currency: 'USD' },
        sellingPrice: { amount: 18.5, currency: 'USD' },
        locationRef: {
          facilityId: 'FAC_WEST',
          roomRef: 'ROOM_SUPPLY_1',
          binCode: 'BIN-42',
        },
        recordedByUserId: actorId,
      });

      // Receive additional stock to add another movement
      item.receiveStock({
        quantity: 15,
        unitCost: { amount: 9.5, currency: 'USD' },
        actorId,
        referenceId: 'PO-2026-08',
        reason: 'Restock batch',
      });

      const persistenceData = PrismaInventoryItemMapper.toPersistence(item);

      expect(persistenceData.id).toBe(item.id.getValue());
      expect(persistenceData.sku).toBe('MED-TAPE-PRO');
      expect(persistenceData.name).toBe('Elastic Therapeutic Tape Pro (Blue)');
      expect(persistenceData.category).toBe('THERAPY_CONSUMABLES');
      expect(persistenceData.unit).toBe('ROLLS');
      expect(persistenceData.minimumStock).toEqual(new Prisma.Decimal(10.0));
      expect(persistenceData.quantityOnHand).toEqual(new Prisma.Decimal(40.0));
      expect(persistenceData.purchaseCostAmount).toEqual(new Prisma.Decimal(9.99));
      expect(persistenceData.purchaseCostCurrency).toBe('USD');
      expect(persistenceData.sellingPriceAmount).toEqual(new Prisma.Decimal(18.5));
      expect(persistenceData.status).toBe('ACTIVE');
      expect(persistenceData.version).toBe(2);

      // Map raw mock Prisma record back to domain
      const rawPrismaRecord = {
        ...persistenceData,
        createdAt: new Date('2026-08-25T10:00:00.000Z'),
        updatedAt: new Date('2026-08-25T10:05:00.000Z'),
        movements: item.movements.map((mv) => ({
          id: mv.id.getValue(),
          inventoryItemId: item.id.getValue(),
          movementType: mv.movementType,
          quantityDelta: new Prisma.Decimal(mv.quantityDelta.value),
          balanceAfter: new Prisma.Decimal(mv.balanceAfter.value),
          unitCostAmount: new Prisma.Decimal(mv.unitCost.amount),
          unitCostCurrency: mv.unitCost.currency,
          reason: mv.reason,
          recordedByUserId: mv.recordedByUserId,
          referenceId: mv.referenceId ?? null,
          recordedAt: mv.recordedAt,
        })),
      };

      const reconstituted = PrismaInventoryItemMapper.toDomain(rawPrismaRecord);

      expect(reconstituted.id.getValue()).toBe(item.id.getValue());
      expect(reconstituted.sku.value).toBe('MED-TAPE-PRO');
      expect(reconstituted.name).toBe(item.name);
      expect(reconstituted.quantityOnHand.value).toBe(40.0);
      expect(reconstituted.minimumStock.value).toBe(10.0);
      expect(reconstituted.purchaseCost.amount).toBe(9.99);
      expect(reconstituted.sellingPrice.amount).toBe(18.5);
      expect(reconstituted.locationRef?.facilityId).toBe('FAC_WEST');
      expect(reconstituted.locationRef?.binCode).toBe('BIN-42');
      expect(reconstituted.movements.length).toBe(2);
      expect(reconstituted.movements[0]?.movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(reconstituted.movements[1]?.movementType).toBe(StockMovementType.PURCHASE);
    });
  });

  describe('2. PrismaInventoryItemRepository Operations', () => {
    let mockPrisma: MockPrismaClient;
    let repository: PrismaInventoryItemRepository;

    beforeEach(() => {
      mockPrisma = {
        $transaction: jest.fn(async (callback) => callback(mockPrisma)),
        inventoryItem: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          delete: jest.fn(),
        },
        stockMovement: {
          upsert: jest.fn(),
        },
      };
      repository = new PrismaInventoryItemRepository(mockPrisma as unknown as PrismaClient);
    });

    it('saves inventory item and appends stock movements within transaction', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GEL-5L',
        name: 'Conductive Gel 5L',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      await repository.save(item);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.inventoryItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: item.id.getValue() },
        }),
      );
      expect(mockPrisma.stockMovement.upsert).toHaveBeenCalledTimes(1);
    });

    it('finds inventory item by ID', async () => {
      mockPrisma.inventoryItem.findUnique.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: null,
        sku: 'MED-GEL-5L',
        name: 'Conductive Gel 5L',
        description: null,
        category: 'CLINICAL_SUPPLIES',
        unit: 'BOTTLES',
        minimumStock: new Prisma.Decimal(5),
        quantityOnHand: new Prisma.Decimal(20),
        purchaseCostAmount: new Prisma.Decimal(15),
        purchaseCostCurrency: 'USD',
        sellingPriceAmount: new Prisma.Decimal(0),
        sellingPriceCurrency: 'USD',
        status: 'ACTIVE',
        locationRef: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        movements: [],
      });

      const found = await repository.findById('123e4567-e89b-12d3-a456-426614174000');
      expect(found).not.toBeNull();
      expect(found?.sku.value).toBe('MED-GEL-5L');
      expect(found?.quantityOnHand.value).toBe(20);
    });

    it('finds inventory item by SKU', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: null,
        sku: 'MED-GEL-5L',
        name: 'Conductive Gel 5L',
        description: null,
        category: 'CLINICAL_SUPPLIES',
        unit: 'BOTTLES',
        minimumStock: new Prisma.Decimal(5),
        quantityOnHand: new Prisma.Decimal(20),
        purchaseCostAmount: new Prisma.Decimal(15),
        purchaseCostCurrency: 'USD',
        sellingPriceAmount: new Prisma.Decimal(0),
        sellingPriceCurrency: 'USD',
        status: 'ACTIVE',
        locationRef: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        movements: [],
      });

      const found = await repository.findBySku('med-gel-5l');
      expect(found).not.toBeNull();
      expect(mockPrisma.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: { sku: 'MED-GEL-5L' },
        include: { movements: { orderBy: { recordedAt: 'asc' } } },
      });
    });
  });
});

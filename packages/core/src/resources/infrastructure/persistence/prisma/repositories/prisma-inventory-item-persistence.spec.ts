import { PrismaClient } from '@prisma/client';
import { PrismaInventoryItemRepository } from './prisma-inventory-item.repository';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../../../domain/inventory/enums/stock-movement-type.enum';
import { OptimisticLockException } from '../../../../domain/inventory/exceptions/optimistic-lock.exception';

describe('Phase 6.1: Prisma Inventory Item Persistence & Concurrency Guarantees (ADR-0084)', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let repository: PrismaInventoryItemRepository;

  const actorId = 'usr_test_pharmacist';

  beforeEach(() => {
    mockPrisma = {
      inventoryItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'item_1', version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue({ id: 'item_1' }),
      },
      stockMovement: {
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'mv_1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    } as unknown as jest.Mocked<PrismaClient>;

    repository = new PrismaInventoryItemRepository(mockPrisma);
  });

  describe('1. Transactional Atomicity on Initial Creation', () => {
    it('persists initial aggregate and opening movement inside a single transaction', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GAUZE-01',
        name: 'Sterile Gauze Pads',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.BOXES,
        initialStock: 50,
        recordedByUserId: actorId,
      });

      await repository.save(item);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.inventoryItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: item.id.getValue() },
          create: expect.objectContaining({
            sku: 'MED-GAUZE-01',
            version: 1,
          }),
        }),
      );
      expect(mockPrisma.stockMovement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            inventoryItemId: item.id.getValue(),
            movementType: StockMovementType.ADJUSTMENT_IN,
            reason: 'Initial opening stock balance upon catalog creation',
          }),
        }),
      );
    });
  });

  describe('2. Optimistic Concurrency Control (OCC) on Mutations', () => {
    it('executes atomic conditional update on mutated item checking prior version', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GAUZE-02',
        name: 'Sterile Gauze Large',
        initialStock: 50,
        recordedByUserId: actorId,
      });

      // Mutate stock (version becomes 2)
      item.receiveStock({
        quantity: 20,
        actorId,
        reason: 'Restock shipment',
      });
      expect(item.version).toBe(2);

      await repository.save(item);

      expect(mockPrisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: {
          id: item.id.getValue(),
          version: 1, // prior version
        },
        data: expect.objectContaining({
          version: 2,
        }),
      });
      expect(mockPrisma.stockMovement.upsert).toHaveBeenCalled();
    });

    it('aborts transaction and throws OptimisticLockException when concurrent update modified version', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GAUZE-03',
        name: 'Sterile Gauze Medium',
        initialStock: 50,
        recordedByUserId: actorId,
      });

      item.consumeStock({
        quantity: 10,
        actorId,
        reason: 'Treatment consumption',
      });
      expect(item.version).toBe(2);

      // Simulate concurrent transaction had already incremented version in DB
      (mockPrisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(repository.save(item)).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('3. Transaction Rollback on Partial Failures', () => {
    it('propagates error and does not commit if stock movement insertion fails', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GAUZE-04',
        name: 'Adhesive Gauze',
        initialStock: 30,
        recordedByUserId: actorId,
      });

      item.sellStock({
        quantity: 5,
        actorId,
        reason: 'Retail sale',
      });

      (mockPrisma.stockMovement.upsert as jest.Mock).mockRejectedValueOnce(
        new Error('Database disk I/O error during movement append'),
      );

      await expect(repository.save(item)).rejects.toThrow(
        'Database disk I/O error during movement append',
      );
    });

    it('propagates error and does not commit if inventory item update fails', async () => {
      const item = InventoryItem.create({
        sku: 'MED-GAUZE-05',
        name: 'Gauze Roll',
        initialStock: 30,
        recordedByUserId: actorId,
      });

      item.consumeStock({
        quantity: 5,
        actorId,
        reason: 'Clinic use',
      });

      (mockPrisma.inventoryItem.updateMany as jest.Mock).mockRejectedValueOnce(
        new Error('Deadlock detected in postgres storage engine'),
      );

      await expect(repository.save(item)).rejects.toThrow(
        'Deadlock detected in postgres storage engine',
      );
    });
  });
});

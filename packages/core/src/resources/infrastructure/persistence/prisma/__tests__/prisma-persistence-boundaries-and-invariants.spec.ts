import { PrismaClient, Prisma } from '@prisma/client';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { FixedAsset } from '../../../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { AssetLocation } from '../../../../domain/assets/value-objects/asset-location.vo';
import { AssetCategory } from '../../../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../../../domain/assets/enums/asset-condition.enum';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import { OptimisticLockException } from '../../../../domain/inventory/exceptions/optimistic-lock.exception';
import { PrismaInventoryItemRepository } from '../repositories/prisma-inventory-item.repository';
import { PrismaFixedAssetRepository } from '../repositories/prisma-fixed-asset.repository';
import { PrismaInventoryItemMapper } from '../mappers/prisma-inventory-item.mapper';
import { PrismaFixedAssetMapper } from '../mappers/prisma-fixed-asset.mapper';

interface MockPrismaInventoryClient {
  $transaction: jest.Mock;
  inventoryItem: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    updateMany?: jest.Mock;
  };
}

interface MockPrismaAssetClient {
  $transaction: jest.Mock;
  fixedAsset: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    updateMany?: jest.Mock;
  };
}

describe('Phase 6.4: Resources Persistence Infrastructure Boundaries & Invariant Integrity', () => {
  const actorId = 'usr_clinician_999';
  const sampleLocation = AssetLocation.create({
    facilityId: 'fac_main',
    roomId: 'room_rehab_1',
    zone: 'Zone A',
    description: 'Shelf 3',
  });

  describe('1. Repository Contract & Pure Domain Aggregate Boundaries', () => {
    it('ensures repositories only accept and return pure Domain Aggregates, never raw Prisma entities', async () => {
      const mockPrisma: MockPrismaInventoryClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        inventoryItem: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({
            id: '11111111-1111-4111-a111-111111111111',
            tenantId: 'tenant_1',
            sku: 'BAND-RED-01',
            name: 'Resistance Band (Red)',
            description: 'Heavy resistance band',
            category: 'CLINICAL_SUPPLIES',
            unit: 'UNITS',
            minimumStock: new Prisma.Decimal(10),
            quantityOnHand: new Prisma.Decimal(45),
            purchaseCostAmount: new Prisma.Decimal(5.5),
            purchaseCostCurrency: 'USD',
            sellingPriceAmount: new Prisma.Decimal(12),
            sellingPriceCurrency: 'USD',
            status: 'ACTIVE',
            locationRef: {
              facilityId: 'fac_main',
              roomRef: 'room_1',
              binCode: 'B-12',
            },
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            movements: [],
          }),
        },
      };

      const repo = new PrismaInventoryItemRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById('11111111-1111-4111-a111-111111111111');

      expect(found).toBeInstanceOf(InventoryItem);
      expect(found?.quantityOnHand.value).toBe(45.0);
      expect(found?.purchaseCost.amount).toBe(5.5);
      expect(found?.purchaseCost.currency).toBe('USD');
      // Verify no leaked Prisma types on aggregate instance
      expect((found as unknown as Record<string, unknown>)._prisma).toBeUndefined();
    });

    it('ensures FixedAssetRepository returns fully reconstituted FixedAsset aggregates with Value Objects', async () => {
      const mockPrisma: MockPrismaAssetClient = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
        fixedAsset: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({
            id: '22222222-2222-4222-a222-222222222222',
            tenantId: 'tenant_1',
            assetTag: 'AST-REHAB-001',
            name: 'Ultrasound Therapy Unit',
            description: 'Clinical ultrasound generator',
            category: 'THERAPY_EQUIPMENT',
            purchaseDate: new Date('2025-01-10T00:00:00Z'),
            purchaseValueAmount: new Prisma.Decimal(8500),
            purchaseValueCurrency: 'USD',
            currentEstimatedValueAmount: new Prisma.Decimal(7800),
            currentEstimatedValueCurrency: 'USD',
            condition: 'EXCELLENT',
            status: 'ACTIVE',
            location: {
              facilityId: 'fac_main',
              roomId: 'room_rehab_1',
              zone: 'Zone A',
            },
            notes: 'Bi-annual check',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            historyEvents: [],
            maintenanceRecords: [],
          }),
        },
      };

      const repo = new PrismaFixedAssetRepository(mockPrisma as unknown as PrismaClient);
      const found = await repo.findById(AssetId.create('22222222-2222-4222-a222-222222222222'));

      expect(found).toBeInstanceOf(FixedAsset);
      expect(found?.assetTag).toBe('AST-REHAB-001');
      expect(found?.purchaseValue.amount).toBe(8500.0);
      expect(found?.currentEstimatedValue.amount).toBe(7800.0);
      expect(found?.location.facilityId).toBe('fac_main');
      expect(found?.status).toBe(AssetStatus.ACTIVE);
      expect(found?.condition).toBe(AssetCondition.EXCELLENT);
    });
  });

  describe('2. Unsafe Direct Mutation Prevention', () => {
    it('prohibits arbitrary direct field mutation without aggregate validation', () => {
      const itemRepo = new PrismaInventoryItemRepository({} as PrismaClient);
      const assetRepo = new PrismaFixedAssetRepository({} as PrismaClient);

      const untypedItemRepo = itemRepo as unknown as Record<string, unknown>;
      const untypedAssetRepo = assetRepo as unknown as Record<string, unknown>;

      // Verify that no unsafe partial bypass update methods exist on the repository interfaces
      expect(untypedItemRepo.updateStockDirectly).toBeUndefined();
      expect(untypedItemRepo.updateCurrentStock).toBeUndefined();
      expect(untypedItemRepo.setQuantityOnHand).toBeUndefined();
      expect(untypedAssetRepo.updateStatusDirectly).toBeUndefined();
      expect(untypedAssetRepo.setStatus).toBeUndefined();
    });
  });

  describe('3. Decimal & Scale 2 Persistence Fidelity', () => {
    it('accurately normalizes and serializes Scale 2 values without float precision drift', () => {
      const item = InventoryItem.create({
        sku: 'CLIN-TAPE-01',
        name: 'Rigid Strapping Tape',
        initialStock: 12.5,
        minimumStock: 5.25,
        purchaseCost: { amount: 8.75, currency: 'USD' },
        sellingPrice: { amount: 16.99, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const persistence = PrismaInventoryItemMapper.toPersistence(item);

      expect(persistence.quantityOnHand).toEqual(new Prisma.Decimal(12.5));
      expect(persistence.minimumStock).toEqual(new Prisma.Decimal(5.25));
      expect(persistence.purchaseCostAmount).toEqual(new Prisma.Decimal(8.75));
      expect(persistence.sellingPriceAmount).toEqual(new Prisma.Decimal(16.99));
    });

    it('accurately preserves FixedAsset monetary valuations in Scale 2 Decimal', () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create('33333333-3333-4333-a333-333333333333'),
          tenantId: 'tenant_1',
          assetTag: 'AST-GYM-999',
          name: 'Olympic Power Rack',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-05-01T00:00:00Z'),
          purchaseValue: Money.create(4999.95, 'USD'),
          location: sampleLocation,
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      const persistence = PrismaFixedAssetMapper.toPersistence(asset);

      expect(persistence.purchaseValueAmount).toEqual(new Prisma.Decimal(4999.95));
      expect(persistence.currentEstimatedValueAmount).toEqual(new Prisma.Decimal(4999.95));
      expect(persistence.purchaseValueCurrency).toBe('USD');
    });
  });

  describe('4. Transaction Unit-of-Work & OCC Collision Enforcement', () => {
    it('throws OptimisticLockException when concurrent version mismatch occurs during save', async () => {
      const item = InventoryItem.create({
        sku: 'FOAM-ROLLER-01',
        name: 'High Density Foam Roller',
        initialStock: 10,
        recordedByUserId: actorId,
      });

      // Simulate a state mutation that increments version to 2
      item.receiveStock({
        quantity: 5,
        unitCost: { amount: 15, currency: 'USD' },
        actorId,
        reason: 'Restock',
      });
      expect(item.version).toBe(2);

      // Mock updateMany returning count: 0 (version collision)
      const mockTx = {
        inventoryItem: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
      };

      const repo = new PrismaInventoryItemRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.save(item)).rejects.toThrow(OptimisticLockException);
    });

    it('FixedAsset throws OptimisticLockException on concurrent version conflict', async () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create('44444444-4444-4444-a444-444444444444'),
          tenantId: 'tenant_1',
          assetTag: 'AST-MED-500',
          name: 'Hydrocollator Heating Unit',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2024-01-01T00:00:00Z'),
          purchaseValue: Money.create(2200, 'USD'),
          location: sampleLocation,
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      // Transition status to increment version to 2
      asset.sendToMaintenance(actorId, 'Thermostat sensor check');
      expect(asset.version).toBe(2);

      const mockTx = {
        fixedAsset: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
      };

      const repo = new PrismaFixedAssetRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.save(asset)).rejects.toThrow(OptimisticLockException);
    });
  });
});

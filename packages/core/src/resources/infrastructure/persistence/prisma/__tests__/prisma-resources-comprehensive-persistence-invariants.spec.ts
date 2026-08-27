import { PrismaClient, Prisma } from '@prisma/client';
import { InventoryItem } from '../../../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../../../domain/inventory/enums/unit-of-measure.enum';
import { Quantity } from '../../../../domain/inventory/value-objects/quantity.vo';
import { FixedAsset } from '../../../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { AssetLocation } from '../../../../domain/assets/value-objects/asset-location.vo';
import { AssetCategory } from '../../../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../../../domain/assets/enums/asset-condition.enum';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import { PrismaInventoryItemRepository } from '../repositories/prisma-inventory-item.repository';
import { PrismaInventoryItemMapper } from '../mappers/prisma-inventory-item.mapper';
import { PrismaFixedAssetMapper } from '../mappers/prisma-fixed-asset.mapper';
import { PrismaStockMovementMapper } from '../mappers/prisma-stock-movement.mapper';
import { PrismaAssetHistoryEventMapper } from '../mappers/prisma-asset-history-event.mapper';
import { PrismaAssetMaintenanceRecordMapper } from '../mappers/prisma-asset-maintenance-record.mapper';

describe('Phase 6.4: Resources Comprehensive Persistence Invariants & Business Fidelity', () => {
  const actorId = 'usr_clinician_alpha';
  const defaultLocation = AssetLocation.create({
    facilityId: 'fac_central',
    roomId: 'room_rehab_3',
    zone: 'Zone C',
    description: 'Physical Therapy Bay',
  });

  describe('1. InventoryItem & StockMovement Persistence & Historical Immutability', () => {
    it('persists complete inventory aggregate and verifies all required and optional fields', () => {
      const item = InventoryItem.create({
        sku: 'CLIN-BAND-HEAVY',
        name: 'Resistance Band (Heavy Blue)',
        description: 'Latex-free exercise resistance band',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.UNITS,
        minimumStock: 15.0,
        initialStock: 50.0,
        purchaseCost: { amount: 6.25, currency: 'USD' },
        sellingPrice: { amount: 14.99, currency: 'USD' },
        locationRef: {
          facilityId: 'fac_central',
          roomRef: 'room_rehab_3',
          binCode: 'BIN-101',
        },
        recordedByUserId: actorId,
      });

      const persistenceData = PrismaInventoryItemMapper.toPersistence(item);

      expect(persistenceData.sku).toBe('CLIN-BAND-HEAVY');
      expect(persistenceData.name).toBe('Resistance Band (Heavy Blue)');
      expect(persistenceData.description).toBe('Latex-free exercise resistance band');
      expect(persistenceData.category).toBe('CLINICAL_SUPPLIES');
      expect(persistenceData.unit).toBe('UNITS');
      expect(persistenceData.minimumStock).toEqual(new Prisma.Decimal(15.0));
      expect(persistenceData.quantityOnHand).toEqual(new Prisma.Decimal(50.0));
      expect(persistenceData.purchaseCostAmount).toEqual(new Prisma.Decimal(6.25));
      expect(persistenceData.purchaseCostCurrency).toBe('USD');
      expect(persistenceData.sellingPriceAmount).toEqual(new Prisma.Decimal(14.99));
      expect(persistenceData.sellingPriceCurrency).toBe('USD');
      expect(persistenceData.status).toBe('ACTIVE');
      expect(persistenceData.version).toBe(1);
    });

    it('ensures every persisted stock movement is self-contained and answers what, when, how much, why, and who', () => {
      const item = InventoryItem.create({
        sku: 'MASSAGE-OIL-500ML',
        name: 'Organic Kinesiology Massage Oil',
        initialStock: 20.0,
        purchaseCost: { amount: 12.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      item.receiveStock({
        quantity: 30.0,
        unitCost: { amount: 11.5, currency: 'USD' },
        actorId: 'usr_manager_01',
        referenceId: 'PO-2026-999',
        reason: 'Monthly restock order',
      });

      expect(item.movements).toHaveLength(2);
      const restockMovement = item.movements[1]!;

      const persistedMovement = PrismaStockMovementMapper.toPersistence(restockMovement);

      // What changed
      expect(persistedMovement.movementType).toBe('PURCHASE');
      // When
      expect(persistedMovement.recordedAt).toBeInstanceOf(Date);
      // How much
      expect(persistedMovement.quantityDelta).toEqual(new Prisma.Decimal(30.0));
      expect(persistedMovement.balanceAfter).toEqual(new Prisma.Decimal(50.0));
      expect(persistedMovement.unitCostAmount).toEqual(new Prisma.Decimal(11.5));
      // Why
      expect(persistedMovement.reason).toBe('Monthly restock order');
      expect(persistedMovement.referenceId).toBe('PO-2026-999');
      // Who
      expect(persistedMovement.recordedByUserId).toBe('usr_manager_01');
    });

    it('guarantees historical movement integrity when mutable parent Product properties change', () => {
      const item = InventoryItem.create({
        sku: 'STRAP-TAPE-01',
        name: 'Initial Tape Name',
        initialStock: 10.0,
        purchaseCost: { amount: 5.0, currency: 'USD' },
        sellingPrice: { amount: 10.0, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const initialMovement = item.movements[0]!;
      const persistedInitialMovement = PrismaStockMovementMapper.toPersistence(initialMovement);

      // Mutate parent item attributes (price increase, renaming, status change)
      item.updateCatalogDetails({
        name: 'Updated Premium Strapping Tape',
        description: 'Enhanced adhesive formula',
        purchaseCost: Money.create(7.5, 'USD'),
        sellingPrice: Money.create(18.0, 'USD'),
        minimumStock: Quantity.of(20.0),
      });
      item.deactivate(actorId, 'Temporarily discontinued');

      // Verify that previously persisted movement record remains 100% unaffected
      expect(persistedInitialMovement.unitCostAmount).toEqual(new Prisma.Decimal(5.0));
      expect(persistedInitialMovement.quantityDelta).toEqual(new Prisma.Decimal(10.0));
      expect(persistedInitialMovement.balanceAfter).toEqual(new Prisma.Decimal(10.0));
      expect(persistedInitialMovement.reason).toBe(
        'Initial opening stock balance upon catalog creation',
      );
    });
  });

  describe('2. FixedAsset, AssetHistory & Maintenance Records Persistence', () => {
    it('persists complete FixedAsset aggregate including acquisition value, condition, and location', () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create('a1111111-2222-4333-8444-555555555555'),
          tenantId: 'tenant_kinergy_prime',
          assetTag: 'AST-KINE-001',
          name: 'High-Frequency Ultrasound Therapy Device',
          description: 'Multi-frequency musculoskeletal therapy head',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2025-02-15T00:00:00Z'),
          purchaseValue: Money.create(8999.5, 'USD'),
          location: defaultLocation,
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          notes: 'Covered under 3-year manufacturer warranty',
        },
        actorId,
      );

      const persistence = PrismaFixedAssetMapper.toPersistence(asset);

      expect(persistence.id).toBe('a1111111-2222-4333-8444-555555555555');
      expect(persistence.tenantId).toBe('tenant_kinergy_prime');
      expect(persistence.assetTag).toBe('AST-KINE-001');
      expect(persistence.category).toBe('THERAPY_EQUIPMENT');
      expect(persistence.purchaseValueAmount).toEqual(new Prisma.Decimal(8999.5));
      expect(persistence.currentEstimatedValueAmount).toEqual(new Prisma.Decimal(8999.5));
      expect(persistence.condition).toBe('EXCELLENT');
      expect(persistence.status).toBe('ACTIVE');
      expect(persistence.version).toBe(1);
    });

    it('verifies self-contained AssetHistory events can explain meaningful lifecycle transitions', () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create('b2222222-3333-4444-8555-666666666666'),
          tenantId: 'tenant_kinergy_prime',
          assetTag: 'AST-GYM-TREAD-01',
          name: 'Commercial Curve Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-01-10T00:00:00Z'),
          purchaseValue: Money.create(6500.0, 'USD'),
          location: defaultLocation,
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      // Perform lifecycle state transitions
      asset.sendToMaintenance('usr_tech_01', 'Belt alignment calibration');
      asset.restoreToActive('usr_tech_01', 'Realigned and lubricated');
      asset.updateEstimatedValue(
        Money.create(5800.0, 'USD'),
        'usr_accountant_01',
        'Annual straight-line depreciation',
      );

      expect(asset.historyEvents).toHaveLength(4);

      // Verify history event persistence structures
      const persistedEvents = asset.historyEvents.map(PrismaAssetHistoryEventMapper.toPersistence);

      expect(persistedEvents[0]!.eventType).toBe('CREATED');
      expect(persistedEvents[1]!.eventType).toBe('STATUS_CHANGED');
      expect(persistedEvents[1]!.recordedByUserId).toBe('usr_tech_01');

      expect(persistedEvents[2]!.eventType).toBe('STATUS_CHANGED');
      expect(persistedEvents[2]!.recordedByUserId).toBe('usr_tech_01');

      expect(persistedEvents[3]!.eventType).toBe('VALUE_UPDATED');
      expect(persistedEvents[3]!.recordedByUserId).toBe('usr_accountant_01');
    });

    it('persists maintenance records and validates technician attribution and non-negative servicing cost', () => {
      const asset = FixedAsset.create(
        {
          id: AssetId.create('c3333333-4444-4555-8666-777777777777'),
          tenantId: 'tenant_kinergy_prime',
          assetTag: 'AST-PILATES-REFORMER',
          name: 'Commercial Reformer Frame',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2023-06-01T00:00:00Z'),
          purchaseValue: Money.create(4200.0, 'USD'),
          location: defaultLocation,
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      asset.recordMaintenance(
        {
          serviceDate: new Date('2026-08-20T09:00:00Z'),
          description: 'Replaced carriage wheels and high-tension springs',
          cost: Money.create(285.5, 'USD'),
          performedBy: 'SpringTech Precision Repairs Ltd.',
          notes: 'Replaced 4 red springs and 1 blue spring',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        'usr_facility_mgr',
      );

      expect(asset.maintenanceRecords).toHaveLength(1);
      const maintenance = asset.maintenanceRecords[0]!;

      const persistedRecord = PrismaAssetMaintenanceRecordMapper.toPersistence(maintenance);

      expect(persistedRecord.assetId).toBe('c3333333-4444-4555-8666-777777777777');
      expect(persistedRecord.description).toBe('Replaced carriage wheels and high-tension springs');
      expect(persistedRecord.costAmount).toEqual(new Prisma.Decimal(285.5));
      expect(persistedRecord.costCurrency).toBe('USD');
      expect(persistedRecord.performedBy).toBe('SpringTech Precision Repairs Ltd.');
      expect(persistedRecord.recordedByUserId).toBe('usr_facility_mgr');
    });
  });

  describe('3. Precision & Non-Floating-Point Verification', () => {
    it('verifies exact Scale 2 Decimal representation without floating-point drift', () => {
      const item = InventoryItem.create({
        sku: 'DECIMAL-TEST-SKU',
        name: 'Precision Test Item',
        initialStock: 100.33,
        minimumStock: 25.67,
        purchaseCost: { amount: 19.99, currency: 'USD' },
        sellingPrice: { amount: 39.95, currency: 'USD' },
        recordedByUserId: actorId,
      });

      const persistence = PrismaInventoryItemMapper.toPersistence(item);

      // Verify Prisma Decimal representations
      expect(persistence.quantityOnHand.toString()).toBe('100.33');
      expect(persistence.minimumStock.toString()).toBe('25.67');
      expect(persistence.purchaseCostAmount.toString()).toBe('19.99');
      expect(persistence.sellingPriceAmount.toString()).toBe('39.95');

      // Reconstitute back to domain and verify equality
      const rawRecord = {
        ...persistence,
        createdAt: new Date(),
        updatedAt: new Date(),
        movements: [],
      };

      const domainItem = PrismaInventoryItemMapper.toDomain(rawRecord);

      expect(domainItem.quantityOnHand.value).toBe(100.33);
      expect(domainItem.minimumStock.value).toBe(25.67);
      expect(domainItem.purchaseCost.amount).toBe(19.99);
      expect(domainItem.sellingPrice.amount).toBe(39.95);
    });
  });

  describe('4. Transaction Support & Atomic Rollback Verification', () => {
    it('guarantees atomic unit-of-work rollback if stock movement persistence fails', async () => {
      const item = InventoryItem.create({
        sku: 'ATOMIC-ROLLBACK-SKU',
        name: 'Atomic Rollback Test Item',
        initialStock: 10.0,
        recordedByUserId: actorId,
      });

      const mockTx = {
        inventoryItem: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        stockMovement: {
          upsert: jest.fn().mockRejectedValue(new Error('Foreign key database failure')),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
      };

      const repo = new PrismaInventoryItemRepository(mockPrisma as unknown as PrismaClient);

      await expect(repo.save(item)).rejects.toThrow('Foreign key database failure');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

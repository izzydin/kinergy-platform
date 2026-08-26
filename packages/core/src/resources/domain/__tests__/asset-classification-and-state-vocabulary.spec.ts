import {
  AssetCategory,
  ASSET_CATEGORY_REGISTRY,
  isAssetCategory,
  parseAssetCategory,
} from '../assets/enums/asset-category.enum';
import {
  AssetStatus,
  ASSET_STATUS_REGISTRY,
  isAssetStatus,
  isTerminalAssetStatus,
  parseAssetStatus,
} from '../assets/enums/asset-status.enum';
import {
  AssetCondition,
  ASSET_CONDITION_REGISTRY,
  isAssetCondition,
  parseAssetCondition,
} from '../assets/enums/asset-condition.enum';
import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { PrismaFixedAssetMapper } from '../../infrastructure/persistence/prisma/mappers/prisma-fixed-asset.mapper';
import {
  AssetCategory as PrismaAssetCategory,
  AssetStatus as PrismaAssetStatus,
  AssetCondition as PrismaAssetCondition,
} from '@prisma/client';

describe('Fixed Asset Classification, State Vocabulary & Orthogonality', () => {
  const actorId = 'usr_lead_architect_01';
  const location = AssetLocation.create({
    facilityId: 'fac_central_01',
    roomId: 'room_rehab_01',
  });

  describe('1. Asset Category Strategy & Validation', () => {
    const requiredCategories = [
      AssetCategory.GYM_EQUIPMENT,
      AssetCategory.THERAPY_EQUIPMENT,
      AssetCategory.KITCHEN_EQUIPMENT,
      AssetCategory.OFFICE_FURNITURE,
      AssetCategory.ELECTRONICS,
      AssetCategory.CLEANING_EQUIPMENT,
    ];

    it('contains all 6 required canonical categories', () => {
      expect(Object.values(AssetCategory)).toHaveLength(6);
      for (const cat of requiredCategories) {
        expect(Object.values(AssetCategory)).toContain(cat);
        expect(ASSET_CATEGORY_REGISTRY[cat]).toBeDefined();
        expect(ASSET_CATEGORY_REGISTRY[cat].displayName.length).toBeGreaterThan(0);
        expect(ASSET_CATEGORY_REGISTRY[cat].description.length).toBeGreaterThan(0);
      }
    });

    it('validates and parses valid category strings case-insensitively', () => {
      expect(parseAssetCategory('gym_equipment')).toBe(AssetCategory.GYM_EQUIPMENT);
      expect(parseAssetCategory('THERAPY_EQUIPMENT')).toBe(AssetCategory.THERAPY_EQUIPMENT);
      expect(parseAssetCategory(' electronics ')).toBe(AssetCategory.ELECTRONICS);
      expect(isAssetCategory(AssetCategory.KITCHEN_EQUIPMENT)).toBe(true);
    });

    it('rejects invalid category strings', () => {
      expect(isAssetCategory('SUPPLEMENTS')).toBe(false);
      expect(isAssetCategory('FOOD')).toBe(false);
      expect(() => parseAssetCategory('INVALID_CAT')).toThrow(/Invalid asset category/);

      expect(() => {
        FixedAsset.create(
          {
            assetTag: 'AST-CAT-ERR',
            name: 'Invalid Item',
            category: 'UNKNOWN_CATEGORY' as unknown as AssetCategory,
            purchaseDate: new Date(),
            purchaseValue: Money.create(100),
            location,
          },
          actorId,
        );
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('2. Asset Status Lifecycle Strategy & State Machine', () => {
    const requiredStatuses = [
      AssetStatus.ACTIVE,
      AssetStatus.UNDER_MAINTENANCE,
      AssetStatus.DAMAGED,
      AssetStatus.RETIRED,
      AssetStatus.SOLD,
    ];

    it('contains all 5 required canonical lifecycle statuses', () => {
      expect(Object.values(AssetStatus)).toHaveLength(5);
      for (const status of requiredStatuses) {
        expect(Object.values(AssetStatus)).toContain(status);
        expect(ASSET_STATUS_REGISTRY[status]).toBeDefined();
        expect(ASSET_STATUS_REGISTRY[status].displayName.length).toBeGreaterThan(0);
      }
    });

    it('accurately distinguishes operational and terminal capabilities', () => {
      expect(ASSET_STATUS_REGISTRY[AssetStatus.ACTIVE].isOperational).toBe(true);
      expect(ASSET_STATUS_REGISTRY[AssetStatus.UNDER_MAINTENANCE].isOperational).toBe(false);
      expect(ASSET_STATUS_REGISTRY[AssetStatus.DAMAGED].isOperational).toBe(false);
      expect(ASSET_STATUS_REGISTRY[AssetStatus.RETIRED].isOperational).toBe(false);
      expect(ASSET_STATUS_REGISTRY[AssetStatus.SOLD].isOperational).toBe(false);

      expect(isTerminalAssetStatus(AssetStatus.SOLD)).toBe(true);
      expect(isTerminalAssetStatus(AssetStatus.ACTIVE)).toBe(false);
      expect(isTerminalAssetStatus(AssetStatus.RETIRED)).toBe(false);
    });

    it('validates and parses valid status strings case-insensitively', () => {
      expect(parseAssetStatus('active')).toBe(AssetStatus.ACTIVE);
      expect(parseAssetStatus('UNDER_MAINTENANCE')).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(parseAssetStatus(' sold ')).toBe(AssetStatus.SOLD);
    });

    it('rejects invalid status strings', () => {
      expect(isAssetStatus('PENDING')).toBe(false);
      expect(isAssetStatus('DELETED')).toBe(false);
      expect(() => parseAssetStatus('UNKNOWN_STATUS')).toThrow(/Invalid asset status/);
    });
  });

  describe('3. Asset Condition Degradation Scale & Severity', () => {
    const requiredConditions = [
      AssetCondition.EXCELLENT,
      AssetCondition.GOOD,
      AssetCondition.FAIR,
      AssetCondition.NEEDS_REPAIR,
      AssetCondition.OUT_OF_SERVICE,
    ];

    it('contains all 5 required canonical condition ratings', () => {
      expect(Object.values(AssetCondition)).toHaveLength(5);
      for (const condition of requiredConditions) {
        expect(Object.values(AssetCondition)).toContain(condition);
        expect(ASSET_CONDITION_REGISTRY[condition]).toBeDefined();
        expect(ASSET_CONDITION_REGISTRY[condition].severityRank).toBeGreaterThanOrEqual(1);
        expect(ASSET_CONDITION_REGISTRY[condition].severityRank).toBeLessThanOrEqual(5);
      }
    });

    it('correctly maps serviceability and technician intervention flags', () => {
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.EXCELLENT].isServiceable).toBe(true);
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.GOOD].isServiceable).toBe(true);
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.FAIR].isServiceable).toBe(true);
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.NEEDS_REPAIR].isServiceable).toBe(false);
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.OUT_OF_SERVICE].isServiceable).toBe(false);

      expect(
        ASSET_CONDITION_REGISTRY[AssetCondition.NEEDS_REPAIR].requiresTechnicianAttention,
      ).toBe(true);
      expect(
        ASSET_CONDITION_REGISTRY[AssetCondition.OUT_OF_SERVICE].requiresTechnicianAttention,
      ).toBe(true);
      expect(ASSET_CONDITION_REGISTRY[AssetCondition.GOOD].requiresTechnicianAttention).toBe(false);
    });

    it('validates and parses valid condition strings', () => {
      expect(parseAssetCondition('excellent')).toBe(AssetCondition.EXCELLENT);
      expect(parseAssetCondition('NEEDS_REPAIR')).toBe(AssetCondition.NEEDS_REPAIR);
      expect(parseAssetCondition(' out_of_service ')).toBe(AssetCondition.OUT_OF_SERVICE);
    });

    it('rejects invalid condition strings', () => {
      expect(isAssetCondition('BROKEN')).toBe(false);
      expect(isAssetCondition('PERFECT')).toBe(false);
      expect(() => parseAssetCondition('POOR')).toThrow(/Invalid asset condition/);
    });
  });

  describe('4. Status and Condition Orthogonality & Coexistence', () => {
    it('allows ACTIVE status with FAIR condition (wear-and-tear without immediate outage)', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-GYM-101',
          name: 'Rowing Ergometer Station',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2023-01-01'),
          purchaseValue: Money.create(2500),
          location,
          condition: AssetCondition.FAIR,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.condition).toBe(AssetCondition.FAIR);
    });

    it('allows UNDER_MAINTENANCE status with NEEDS_REPAIR condition during overhaul', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-LSR-102',
          name: 'High Intensity Laser',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2024-01-01'),
          purchaseValue: Money.create(15000),
          location,
          condition: AssetCondition.NEEDS_REPAIR,
          status: AssetStatus.UNDER_MAINTENANCE,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.condition).toBe(AssetCondition.NEEDS_REPAIR);
    });

    it('allows DAMAGED status with OUT_OF_SERVICE condition', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-APP-103',
          name: 'Heavy Duty Ice Machine',
          category: AssetCategory.KITCHEN_EQUIPMENT,
          purchaseDate: new Date('2022-01-01'),
          purchaseValue: Money.create(4000),
          location,
          condition: AssetCondition.OUT_OF_SERVICE,
          status: AssetStatus.DAMAGED,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.DAMAGED);
      expect(asset.condition).toBe(AssetCondition.OUT_OF_SERVICE);
    });

    it('does not change condition implicitly when maintenance is recorded without updateConditionTo', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-FUR-104',
          name: 'Treatment Plinth Bed',
          category: AssetCategory.OFFICE_FURNITURE,
          purchaseDate: new Date('2023-05-01'),
          purchaseValue: Money.create(1800),
          location,
          condition: AssetCondition.GOOD,
          status: AssetStatus.UNDER_MAINTENANCE,
        },
        actorId,
      );

      // Perform maintenance without specifying condition change
      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Hydraulic pump oil lubrication',
          cost: Money.create(120),
          performedBy: 'In-house Facility Staff',
        },
        actorId,
      );

      // Condition remains unchanged; status returns to ACTIVE
      expect(asset.condition).toBe(AssetCondition.GOOD);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
    });

    it('explicitly upgrades condition and restores ACTIVE status when maintenance specifies updateConditionTo', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-GYM-105',
          name: 'Cable Crossover Tower',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2022-01-01'),
          purchaseValue: Money.create(6000),
          location,
          condition: AssetCondition.NEEDS_REPAIR,
          status: AssetStatus.DAMAGED,
        },
        actorId,
      );

      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Replaced both steel cables and guide pulleys',
          cost: Money.create(450),
          performedBy: 'Apex Gym Technicians',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
    });
  });

  describe('5. Persistence Enum Parity & Serialization', () => {
    it('maps all domain categories, statuses, and conditions to exact Prisma types without loss', () => {
      for (const cat of Object.values(AssetCategory)) {
        expect(PrismaAssetCategory[cat]).toBe(cat);
      }
      for (const status of Object.values(AssetStatus)) {
        expect(PrismaAssetStatus[status]).toBe(status);
      }
      for (const condition of Object.values(AssetCondition)) {
        expect(PrismaAssetCondition[condition]).toBe(condition);
      }
    });

    it('serializes to persistence and reconstitutes each category, status, and condition cleanly', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-ELC-001',
          name: 'Member Check-in Tablet Station',
          category: AssetCategory.ELECTRONICS,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: Money.create(850),
          location,
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
        },
        actorId,
      );

      const persistence = PrismaFixedAssetMapper.toPersistence(asset);
      expect(persistence.category).toBe('ELECTRONICS');
      expect(persistence.status).toBe('ACTIVE');
      expect(persistence.condition).toBe('GOOD');

      const domain = PrismaFixedAssetMapper.toDomain({
        ...persistence,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      });

      expect(domain.category).toBe(AssetCategory.ELECTRONICS);
      expect(domain.status).toBe(AssetStatus.ACTIVE);
      expect(domain.condition).toBe(AssetCondition.GOOD);
    });
  });
});

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  createAssetSchema,
  updateAssetDetailsSchema,
  transferAssetLocationSchema,
  changeAssetStatusSchema,
  updateAssetConditionSchema,
  recordAssetMaintenanceSchema,
  updateAssetValuationSchema,
  assetsQueryKeys,
  AssetStatusBadge,
  AssetConditionBadge,
  AssetCategoryBadge,
} from '../index';

describe('Fixed Assets Foundation & Contracts', () => {
  describe('1. Domain Enums', () => {
    it('verifies exported status, condition, category, and history event enum values', () => {
      expect(AssetStatus.ACTIVE).toBe('ACTIVE');
      expect(AssetStatus.UNDER_MAINTENANCE).toBe('UNDER_MAINTENANCE');
      expect(AssetStatus.DAMAGED).toBe('DAMAGED');
      expect(AssetStatus.RETIRED).toBe('RETIRED');
      expect(AssetStatus.SOLD).toBe('SOLD');

      expect(AssetCondition.EXCELLENT).toBe('EXCELLENT');
      expect(AssetCondition.OUT_OF_SERVICE).toBe('OUT_OF_SERVICE');

      expect(AssetCategory.GYM_EQUIPMENT).toBe('GYM_EQUIPMENT');
      expect(AssetHistoryEventType.TRANSFERRED).toBe('TRANSFERRED');
    });
  });

  describe('2. Zod Validation Schemas', () => {
    it('validates a valid create asset payload', () => {
      const validData = {
        assetTag: 'AST-GYM-2026-001',
        name: 'Biodex System 4 Pro',
        description: 'Isokinetic Dynamometer for rehab and strength testing',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: '2026-01-15T00:00:00.000Z',
        purchaseValueAmount: 45000.0,
        purchaseValueCurrency: 'USD',
        currentEstimatedValueAmount: 42000.0,
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: {
          facilityId: 'fac-main',
          roomId: 'room-rehab-1',
          zone: 'Zone B',
          description: 'Rehabilitation bay 2',
        },
        notes: 'Annual calibration contract active',
      };

      const result = createAssetSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects asset creation with invalid asset tag formatting', () => {
      const invalidData = {
        assetTag: 'AST GYM @@@', // Space and special chars
        name: 'Treadmill',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: '2026-01-15',
        purchaseValueAmount: 5000,
        location: { facilityId: 'fac-1' },
      };

      const result = createAssetSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'Asset tag must contain only alphanumeric characters, dashes, and underscores',
        );
      }
    });

    it('strictly forbids creating an asset directly as RETIRED or SOLD', () => {
      const retiredData = {
        assetTag: 'AST-RETIRED-01',
        name: 'Old Bench',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: '2026-01-15',
        purchaseValueAmount: 500,
        status: AssetStatus.RETIRED,
        location: { facilityId: 'fac-1' },
      };

      const retiredResult = createAssetSchema.safeParse(retiredData);
      expect(retiredResult.success).toBe(false);
      if (!retiredResult.success) {
        expect(retiredResult.error.issues[0]?.message).toContain(
          'RETIRED and SOLD cannot be set at creation',
        );
      }

      const soldData = {
        ...retiredData,
        status: AssetStatus.SOLD,
      };
      const soldResult = createAssetSchema.safeParse(soldData);
      expect(soldResult.success).toBe(false);
    });

    it('validates location transfer payload', () => {
      const validTransfer = {
        location: {
          facilityId: 'fac-north',
          roomId: 'room-cardio',
          zone: 'Floor 2',
        },
        reason: 'Relocated for floor renovation',
      };

      const result = transferAssetLocationSchema.safeParse(validTransfer);
      expect(result.success).toBe(true);

      const invalidTransfer = {
        location: { facilityId: '' },
      };
      expect(transferAssetLocationSchema.safeParse(invalidTransfer).success).toBe(false);
    });

    it('validates descriptive details update payload', () => {
      const validDetails = {
        name: 'Biodex System 4 Pro Upgraded',
        description: 'New motor module installed',
        reason: 'Equipment firmware and component upgrade',
      };
      expect(updateAssetDetailsSchema.safeParse(validDetails).success).toBe(true);

      const invalidDetails = {
        name: 'A', // < 2 chars
      };
      expect(updateAssetDetailsSchema.safeParse(invalidDetails).success).toBe(false);
    });

    it('validates condition rating update payload', () => {
      const validCondition = {
        condition: AssetCondition.GOOD,
        reason: 'Normal wear after 6 months usage',
      };
      expect(updateAssetConditionSchema.safeParse(validCondition).success).toBe(true);
    });

    it('validates change status payload and strictly rejects transition to SOLD', () => {
      const validMaintenance = {
        status: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Scheduled quarterly motor calibration',
      };
      expect(changeAssetStatusSchema.safeParse(validMaintenance).success).toBe(true);

      const shortReason = {
        status: AssetStatus.DAMAGED,
        reason: 'no', // < 3 chars
      };
      expect(changeAssetStatusSchema.safeParse(shortReason).success).toBe(false);

      const forbiddenSold = {
        status: AssetStatus.SOLD,
        reason: 'Sold to third party liquidation buyer',
      };
      const soldResult = changeAssetStatusSchema.safeParse(forbiddenSold);
      expect(soldResult.success).toBe(false);
      if (!soldResult.success) {
        expect(soldResult.error.issues[0]?.message).toContain(
          "Direct status change to 'SOLD' is prohibited",
        );
      }
    });

    it('validates maintenance work order payload with mandatory fields', () => {
      const validMaintenance = {
        serviceDate: '2026-08-30T10:00:00Z',
        description: 'Belt replacement and motor bearing lubrication',
        costAmount: 450.0,
        costCurrency: 'USD',
        performedBy: 'Biodex Field Tech #42',
        updateConditionTo: AssetCondition.EXCELLENT,
        notes: 'Operational sign-off complete',
      };

      const result = recordAssetMaintenanceSchema.safeParse(validMaintenance);
      expect(result.success).toBe(true);

      const missingTech = {
        ...validMaintenance,
        performedBy: 'T', // < 2 chars
      };
      expect(recordAssetMaintenanceSchema.safeParse(missingTech).success).toBe(false);

      const negativeCost = {
        ...validMaintenance,
        costAmount: -100,
      };
      expect(recordAssetMaintenanceSchema.safeParse(negativeCost).success).toBe(false);
    });

    it('validates fair market valuation update payload', () => {
      const validValuation = {
        estimatedValueAmount: 38000.0,
        currency: 'USD',
        reason: 'Annual equipment appraisal depreciation adjustment',
      };

      expect(updateAssetValuationSchema.safeParse(validValuation).success).toBe(true);

      const negativeValuation = {
        estimatedValueAmount: -50,
      };
      expect(updateAssetValuationSchema.safeParse(negativeValuation).success).toBe(false);
    });
  });

  describe('3. Query Key Factory Architecture', () => {
    it('produces deterministic hierarchical query keys matching Kinergy convention', () => {
      expect(assetsQueryKeys.all).toEqual(['resources', 'assets']);
      expect(assetsQueryKeys.categories()).toEqual(['resources', 'assets', 'categories']);
      expect(assetsQueryKeys.tag('AST-001')).toEqual(['resources', 'assets', 'tag', 'AST-001']);
      expect(assetsQueryKeys.lists()).toEqual(['resources', 'assets', 'list']);
      expect(assetsQueryKeys.list({ page: 1, limit: 10 })).toEqual([
        'resources',
        'assets',
        'list',
        { page: 1, limit: 10 },
      ]);
      expect(assetsQueryKeys.detail('ast-101')).toEqual([
        'resources',
        'assets',
        'detail',
        'ast-101',
      ]);
      expect(assetsQueryKeys.valuation('ast-101')).toEqual([
        'resources',
        'assets',
        'detail',
        'ast-101',
        'valuation',
      ]);
      expect(assetsQueryKeys.history('ast-101', { page: 1 })).toEqual([
        'resources',
        'assets',
        'detail',
        'ast-101',
        'history',
        { page: 1 },
      ]);
      expect(assetsQueryKeys.maintenance('ast-101', { page: 1 })).toEqual([
        'resources',
        'assets',
        'detail',
        'ast-101',
        'maintenance',
        { page: 1 },
      ]);
      expect(assetsQueryKeys.valuationSummary({ includeDecommissioned: true })).toEqual([
        'resources',
        'valuation',
        'assets',
        'summary',
        { includeDecommissioned: true },
      ]);
    });
  });

  describe('4. Presentation Badge Primitives', () => {
    it('renders AssetStatusBadge with correct label for all statuses', () => {
      const { rerender } = render(<AssetStatusBadge status={AssetStatus.ACTIVE} />);
      expect(screen.getByText('Active')).toBeInTheDocument();

      rerender(<AssetStatusBadge status={AssetStatus.UNDER_MAINTENANCE} />);
      expect(screen.getByText('Under Maintenance')).toBeInTheDocument();

      rerender(<AssetStatusBadge status={AssetStatus.DAMAGED} />);
      expect(screen.getByText('Damaged')).toBeInTheDocument();

      rerender(<AssetStatusBadge status={AssetStatus.RETIRED} />);
      expect(screen.getByText('Retired')).toBeInTheDocument();

      rerender(<AssetStatusBadge status={AssetStatus.SOLD} />);
      expect(screen.getByText('Sold')).toBeInTheDocument();
    });

    it('renders AssetConditionBadge with rank option', () => {
      const { rerender } = render(
        <AssetConditionBadge condition={AssetCondition.EXCELLENT} showRank />,
      );
      expect(screen.getByText('Rank 1 • Excellent')).toBeInTheDocument();

      rerender(<AssetConditionBadge condition={AssetCondition.NEEDS_REPAIR} />);
      expect(screen.getByText('Needs Repair')).toBeInTheDocument();

      rerender(<AssetConditionBadge condition={AssetCondition.OUT_OF_SERVICE} showRank />);
      expect(screen.getByText('Rank 5 • Out of Service')).toBeInTheDocument();
    });

    it('renders AssetCategoryBadge with human-readable descriptor', () => {
      render(<AssetCategoryBadge category={AssetCategory.GYM_EQUIPMENT} />);
      expect(screen.getByText('Gym Equipment')).toBeInTheDocument();
    });
  });
});

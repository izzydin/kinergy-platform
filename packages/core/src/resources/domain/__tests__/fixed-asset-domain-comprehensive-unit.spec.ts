import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { InvalidAssetLocationException } from '../assets/exceptions/invalid-asset-location.exception';
import { InvalidMoneyException } from '../inventory/exceptions/invalid-money.exception';

describe('Phase 6.10: Fixed Asset Comprehensive Domain & Lifecycle Unit Test Suite', () => {
  const actorId = 'usr_senior_asset_engineer';
  const defaultLocation = AssetLocation.create({
    facilityId: 'fac_flagship_01',
    roomId: 'room_rehab_recovery',
    zone: 'Zone B',
    description: 'Hydro & Cryotherapy Bay',
  });

  const createBaselineAsset = (
    overrides: Partial<Parameters<typeof FixedAsset.create>[0]> = {},
    actor: string = actorId,
  ): FixedAsset => {
    return FixedAsset.create(
      {
        assetTag: 'AST-KNRG-001',
        name: 'Cryotherapy Recovery Chamber',
        description: 'Sub-zero whole-body therapeutic recovery chamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2025-01-10T09:00:00.000Z'),
        purchaseValue: Money.create(45000.0, 'USD'),
        location: defaultLocation,
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        notes: 'Annual liquid nitrogen sensor inspection required.',
        ...overrides,
      },
      actor,
    );
  };

  // ============================================================================
  // 1. REGISTRATION & ATTRIBUTE VALIDATION INVARIANTS
  // ============================================================================
  describe('1. Asset Registration & Domain Construction Invariants', () => {
    it('constructs a valid FixedAsset aggregate with initial CREATED history and domain event', () => {
      const asset = createBaselineAsset();

      expect(asset.id).toBeDefined();
      expect(asset.assetTag).toBe('AST-KNRG-001');
      expect(asset.name).toBe('Cryotherapy Recovery Chamber');
      expect(asset.category).toBe(AssetCategory.THERAPY_EQUIPMENT);
      expect(asset.purchaseValue.amount).toBe(45000.0);
      expect(asset.currentEstimatedValue.amount).toBe(45000.0);
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.location.facilityId).toBe('fac_flagship_01');
      expect(asset.version).toBe(1);

      expect(asset.historyEvents).toHaveLength(1);
      expect(asset.historyEvents[0]!.eventType).toBe(AssetHistoryEventType.CREATED);
      expect(asset.historyEvents[0]!.recordedByUserId).toBe(actorId);

      const uncommittedEvents = asset.getUncommittedEvents();
      expect(uncommittedEvents).toHaveLength(1);
      expect(uncommittedEvents[0]!.eventType).toBe('AssetCreated');
    });

    it('rejects invalid or empty asset names', () => {
      expect(() => createBaselineAsset({ name: '' })).toThrow(InvalidAssetStateException);
      expect(() => createBaselineAsset({ name: '   ' })).toThrow(InvalidAssetStateException);
      expect(() => createBaselineAsset({ name: 'A' })).toThrow(InvalidAssetStateException);
      expect(() => createBaselineAsset({ name: 'A'.repeat(121) })).toThrow(
        InvalidAssetStateException,
      );
    });

    it('rejects malformed asset tags', () => {
      expect(() => createBaselineAsset({ assetTag: '' })).toThrow(InvalidAssetStateException);
      expect(() => createBaselineAsset({ assetTag: 'AST TAG' })).toThrow(
        InvalidAssetStateException,
      );
      expect(() => createBaselineAsset({ assetTag: 'NO' })).toThrow(InvalidAssetStateException);
      expect(() => createBaselineAsset({ assetTag: 'A'.repeat(33) })).toThrow(
        InvalidAssetStateException,
      );
    });

    it('supports all approved AssetCategory taxonomy values', () => {
      const categories = [
        AssetCategory.GYM_EQUIPMENT,
        AssetCategory.THERAPY_EQUIPMENT,
        AssetCategory.KITCHEN_EQUIPMENT,
        AssetCategory.OFFICE_FURNITURE,
        AssetCategory.ELECTRONICS,
        AssetCategory.CLEANING_EQUIPMENT,
      ];

      for (const cat of categories) {
        const asset = createBaselineAsset({
          assetTag: `AST-${cat.substring(0, 4)}-01`,
          category: cat,
        });
        expect(asset.category).toBe(cat);
      }
    });

    it('prohibits initial aggregate creation directly in terminal statuses (RETIRED or SOLD)', () => {
      expect(() => createBaselineAsset({ status: AssetStatus.RETIRED })).toThrow(
        InvalidAssetStateException,
      );
      expect(() => createBaselineAsset({ status: AssetStatus.SOLD })).toThrow(
        InvalidAssetStateException,
      );
    });
  });

  // ============================================================================
  // 2. STATE MACHINE TRANSITIONS MATRIX (SYSTEMATIC SOURCE-TO-TARGET)
  // ============================================================================
  describe('2. State Machine Transitions Matrix', () => {
    describe('2.1 Source State: ACTIVE', () => {
      it('ALLOWED: transitions to UNDER_MAINTENANCE via sendToMaintenance', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.sendToMaintenance(actorId, 'Routine 90-day preventative maintenance inspection');

        expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
        expect(asset.version).toBe(2);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      });

      it('ALLOWED: transitions to DAMAGED via markAsDamaged', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.markAsDamaged(actorId, 'Cryo pressure seal cracked during high-volume session');

        expect(asset.status).toBe(AssetStatus.DAMAGED);
        expect(asset.version).toBe(2);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      });

      it('ALLOWED: transitions to RETIRED via retire', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.retire(actorId, 'Decommissioned to make floor space for new hyperbaric chamber');

        expect(asset.status).toBe(AssetStatus.RETIRED);
        expect(asset.version).toBe(2);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.RETIRED);
      });

      it('ALLOWED: transitions to SOLD via sell() with realized salvage valuation', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        const salePrice = Money.create(18000.0, 'USD');
        asset.sell(salePrice, actorId, 'Liquidated to affiliated rehabilitation institute');

        expect(asset.status).toBe(AssetStatus.SOLD);
        expect(asset.currentEstimatedValue.amount).toBe(18000.0);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
      });

      it('FORBIDDEN: self-transition ACTIVE -> ACTIVE is rejected', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        expect(() =>
          asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Redundant activation'),
        ).toThrow(/already in 'ACTIVE' status/);
      });

      it('FORBIDDEN: direct changeStatus to SOLD without sell() is rejected', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        expect(() =>
          asset.changeStatus(AssetStatus.SOLD, actorId, 'Attempted direct SOLD transition'),
        ).toThrow(/Direct status change to 'SOLD' is prohibited/);
      });
    });

    describe('2.2 Source State: UNDER_MAINTENANCE', () => {
      it('ALLOWED: transitions to ACTIVE via restoreToActive', () => {
        const asset = createBaselineAsset({ status: AssetStatus.UNDER_MAINTENANCE });
        asset.restoreToActive(actorId, 'Calibration and seal replacement verified complete');

        expect(asset.status).toBe(AssetStatus.ACTIVE);
      });

      it('ALLOWED: transitions to DAMAGED via markAsDamaged (Diagnostic Failure)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.UNDER_MAINTENANCE });
        asset.markAsDamaged(actorId, 'Internal compressor cracked during pressure testing');

        expect(asset.status).toBe(AssetStatus.DAMAGED);
      });

      it('ALLOWED: transitions to RETIRED via retire (Beyond Economic Repair)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.UNDER_MAINTENANCE });
        asset.retire(actorId, 'Repair cost exceeds 85% replacement value; declared BER write-off');

        expect(asset.status).toBe(AssetStatus.RETIRED);
      });

      it('ALLOWED: transitions to SOLD via sell() (As-Is Parts Sale)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.UNDER_MAINTENANCE });
        asset.sell(Money.create(5000.0, 'USD'), actorId, 'Sold as-is to equipment refurbisher');

        expect(asset.status).toBe(AssetStatus.SOLD);
      });

      it('FORBIDDEN: self-transition UNDER_MAINTENANCE -> UNDER_MAINTENANCE is rejected', () => {
        const asset = createBaselineAsset({ status: AssetStatus.UNDER_MAINTENANCE });
        expect(() =>
          asset.changeStatus(
            AssetStatus.UNDER_MAINTENANCE,
            actorId,
            'Redundant maintenance status',
          ),
        ).toThrow(/already in 'UNDER_MAINTENANCE' status/);
      });
    });

    describe('2.3 Source State: DAMAGED', () => {
      it('ALLOWED: transitions to UNDER_MAINTENANCE via sendToMaintenance', () => {
        const asset = createBaselineAsset({ status: AssetStatus.DAMAGED });
        asset.sendToMaintenance(actorId, 'Dispatched to certified cryogenic repair technician');

        expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      });

      it('ALLOWED: transitions to ACTIVE via restoreToActive when condition is serviceable', () => {
        const asset = createBaselineAsset({
          status: AssetStatus.DAMAGED,
          condition: AssetCondition.GOOD,
        });
        asset.restoreToActive(actorId, 'Repaired and safety-tested operational');

        expect(asset.status).toBe(AssetStatus.ACTIVE);
      });

      it('ALLOWED: transitions to RETIRED via retire (Total Loss)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.DAMAGED });
        asset.retire(actorId, 'Catastrophic thermal fracture; total scrap loss');

        expect(asset.status).toBe(AssetStatus.RETIRED);
      });

      it('ALLOWED: transitions to SOLD via sell() (Recycler Scrap Sale)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.DAMAGED });
        asset.sell(Money.create(750.0, 'USD'), actorId, 'Sold to commercial metal recycler');

        expect(asset.status).toBe(AssetStatus.SOLD);
      });

      it('FORBIDDEN: restoring DAMAGED to ACTIVE when condition is OUT_OF_SERVICE is rejected', () => {
        const asset = createBaselineAsset({
          status: AssetStatus.DAMAGED,
          condition: AssetCondition.OUT_OF_SERVICE,
        });

        expect(() => asset.restoreToActive(actorId, 'Premature activation')).toThrow(
          /Cannot restore fixed asset .* to ACTIVE while condition is 'OUT_OF_SERVICE'/,
        );
      });
    });

    describe('2.4 Source State: RETIRED (Decommissioned)', () => {
      it('ALLOWED: transitions to SOLD via sell() (Salvage Liquidation)', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.retire(actorId, 'End of commercial service life');
        expect(asset.status).toBe(AssetStatus.RETIRED);

        asset.sell(Money.create(2500.0, 'USD'), actorId, 'Surplus equipment auction sale');
        expect(asset.status).toBe(AssetStatus.SOLD);
        expect(asset.currentEstimatedValue.amount).toBe(2500.0);
      });

      it('FORBIDDEN: RETIRED -> ACTIVE is strictly prohibited by accounting standards', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.retire(actorId, 'End of life');

        expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Reactivate retired')).toThrow(
          InvalidAssetStateException,
        );
        expect(() => asset.restoreToActive(actorId, 'Reactivate retired')).toThrow(
          InvalidAssetStateException,
        );
      });

      it('FORBIDDEN: RETIRED -> UNDER_MAINTENANCE is prohibited', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.retire(actorId, 'End of life');

        expect(() => asset.sendToMaintenance(actorId, 'Service decommissioned item')).toThrow(
          InvalidAssetStateException,
        );
      });

      it('FORBIDDEN: RETIRED -> DAMAGED is prohibited', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.retire(actorId, 'End of life');

        expect(() => asset.markAsDamaged(actorId, 'Mark retired damaged')).toThrow(
          InvalidAssetStateException,
        );
      });
    });

    describe('2.5 Source State: SOLD (Irreversible Terminal Sink State) [AST-INV-1]', () => {
      it('FORBIDDEN: ALL status transitions and lifecycle mutations are blocked once SOLD', () => {
        const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
        asset.sell(Money.create(12000.0, 'USD'), actorId, 'Final liquidation sale');
        expect(asset.status).toBe(AssetStatus.SOLD);

        // Status change rejections
        expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Resurrect')).toThrow(
          /terminal state 'SOLD'/,
        );
        expect(() => asset.sendToMaintenance(actorId, 'Service sold')).toThrow(
          /terminal state 'SOLD'/,
        );
        expect(() => asset.markAsDamaged(actorId, 'Damage sold')).toThrow(/terminal state 'SOLD'/);
        expect(() => asset.retire(actorId, 'Retire sold')).toThrow(/terminal state 'SOLD'/);
        expect(() => asset.sell(Money.create(1000.0), actorId, 'Double sell')).toThrow(
          /terminal state 'SOLD'/,
        );
      });
    });
  });

  // ============================================================================
  // 3. PHYSICAL LOCATION TRANSFER RULES & BOUNDARIES [AST-INV-2], [AST-INV-3]
  // ============================================================================
  describe('3. Asset Transfer Rules & Destination Validation', () => {
    it('transfers active asset to a valid destination and emits domain event and history', () => {
      const asset = createBaselineAsset();
      const targetLocation = AssetLocation.create({
        facilityId: 'fac_uptown_branch_02',
        roomId: 'room_physio_suite_4',
        zone: 'Zone West',
        description: 'Orthopedic Rehabilitation Wing',
      });

      asset.transferLocation(
        targetLocation,
        actorId,
        'Relocated to Uptown Branch for specialized clinical trials',
      );

      expect(asset.location.facilityId).toBe('fac_uptown_branch_02');
      expect(asset.location.roomId).toBe('room_physio_suite_4');
      expect(asset.version).toBe(2);

      const latestHistory = asset.historyEvents.at(-1)!;
      expect(latestHistory.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(latestHistory.recordedByUserId).toBe(actorId);

      const uncommitted = asset.getUncommittedEvents();
      expect(uncommitted.some((e) => e.eventType === 'AssetTransferred')).toBe(true);
    });

    it('rejects transfer when destination facilityId is empty or whitespace', () => {
      expect(() => AssetLocation.create({ facilityId: '' })).toThrow(InvalidAssetLocationException);
      expect(() => AssetLocation.create({ facilityId: '   ' })).toThrow(
        InvalidAssetLocationException,
      );
    });

    it('no-ops idempotently without incrementing version when transferred to identical location', () => {
      const asset = createBaselineAsset();
      asset.transferLocation(defaultLocation, actorId, 'Identical location transfer');

      expect(asset.version).toBe(1);
      expect(asset.historyEvents).toHaveLength(1); // Only initial CREATED event
    });

    it('FORBIDDEN: blocks location transfer on RETIRED assets [AST-INV-2]', () => {
      const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
      asset.retire(actorId, 'Decommissioned');

      const newLoc = AssetLocation.create({ facilityId: 'fac_storage_99' });
      expect(() => asset.transferLocation(newLoc, actorId, 'Move retired asset')).toThrow(
        /decommissioned fixed asset .* in state 'RETIRED'/,
      );
    });

    it('FORBIDDEN: blocks location transfer on SOLD assets [AST-INV-1]', () => {
      const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
      asset.sell(Money.create(10000.0), actorId, 'Sold');

      const newLoc = AssetLocation.create({ facilityId: 'fac_storage_99' });
      expect(() => asset.transferLocation(newLoc, actorId, 'Move sold asset')).toThrow(
        /terminal state 'SOLD'/,
      );
    });
  });

  // ============================================================================
  // 4. PHYSICAL CONDITION LIFECYCLE & ORTHOGONALITY GUARDS
  // ============================================================================
  describe('4. Condition Rating Changes & Guard Rules', () => {
    it('updates condition across valid ratings and records CONDITION_CHANGED history', () => {
      const asset = createBaselineAsset();

      asset.updateCondition(
        AssetCondition.FAIR,
        actorId,
        'Surface cosmetic scratches observed during inspection',
      );

      expect(asset.condition).toBe(AssetCondition.FAIR);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
    });

    it('no-ops idempotently when updating to the identical condition rating', () => {
      const asset = createBaselineAsset({ condition: AssetCondition.EXCELLENT });
      asset.updateCondition(AssetCondition.EXCELLENT, actorId, 'Redundant condition check');

      expect(asset.version).toBe(1);
      expect(asset.historyEvents).toHaveLength(1);
    });

    it('supports all approved AssetCondition rating levels', () => {
      const conditions = [
        AssetCondition.EXCELLENT,
        AssetCondition.GOOD,
        AssetCondition.FAIR,
        AssetCondition.NEEDS_REPAIR,
        AssetCondition.OUT_OF_SERVICE,
      ];

      for (const cond of conditions) {
        const asset = createBaselineAsset({ condition: cond });
        expect(asset.condition).toBe(cond);
      }
    });

    it('FORBIDDEN: blocks condition updates on RETIRED or SOLD assets', () => {
      const retiredAsset = createBaselineAsset({ status: AssetStatus.ACTIVE });
      retiredAsset.retire(actorId, 'Decommissioned');
      expect(() =>
        retiredAsset.updateCondition(AssetCondition.NEEDS_REPAIR, actorId, 'Condition change'),
      ).toThrow(/decommissioned fixed asset .* in state 'RETIRED'/);

      const soldAsset = createBaselineAsset({ status: AssetStatus.ACTIVE });
      soldAsset.sell(Money.create(5000.0), actorId, 'Sold');
      expect(() =>
        soldAsset.updateCondition(AssetCondition.NEEDS_REPAIR, actorId, 'Condition change'),
      ).toThrow(/terminal state 'SOLD'/);
    });
  });

  // ============================================================================
  // 5. ASSET VALUATION ARITHMETIC & MONETARY INVARIANTS
  // ============================================================================
  describe('5. Asset Value Validation & Valuation Invariants [AST-INV-7], [AST-INV-8]', () => {
    it('accepts zero purchaseValue ($0.00) for donated or transferred assets', () => {
      const asset = createBaselineAsset({ purchaseValue: Money.zero('USD') });
      expect(asset.purchaseValue.amount).toBe(0.0);
      expect(asset.currentEstimatedValue.amount).toBe(0.0);
    });

    it('updates current estimated economic value with audit history and domain event', () => {
      const asset = createBaselineAsset({ purchaseValue: Money.create(50000.0, 'USD') });
      const revaluedAmount = Money.create(38000.0, 'USD');

      asset.updateEstimatedValue(
        revaluedAmount,
        actorId,
        'Annual straight-line depreciation assessment year 2',
      );

      expect(asset.currentEstimatedValue.amount).toBe(38000.0);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);

      const uncommitted = asset.getUncommittedEvents();
      expect(uncommitted.some((e) => e.eventType === 'AssetValuationUpdated')).toBe(true);
    });

    it('rejects negative purchase values and negative valuation amounts with InvalidMoneyException', () => {
      expect(() => Money.create(-100.0, 'USD')).toThrow(InvalidMoneyException);
      expect(() => Money.create(-0.01, 'USD')).toThrow(InvalidMoneyException);
    });

    it('enforces 2 decimal place monetary precision boundaries deterministically', () => {
      const money = Money.create(1250.456, 'USD');
      expect(money.amount).toBe(1250.46);
    });

    it('FORBIDDEN: blocks revaluation on SOLD assets', () => {
      const asset = createBaselineAsset({ status: AssetStatus.ACTIVE });
      asset.sell(Money.create(8000.0), actorId, 'Sold');

      expect(() =>
        asset.updateEstimatedValue(Money.create(9000.0), actorId, 'Post-sale revalue attempt'),
      ).toThrow(/terminal state 'SOLD'/);
    });
  });

  // ============================================================================
  // 6. MAINTENANCE RULES & SERVICING INVARIANTS [AST-INV-6]
  // ============================================================================
  describe('6. Maintenance Domain Rules & Auto-Restoration Invariants', () => {
    it('records maintenance, appends child record, and auto-restores UNDER_MAINTENANCE to ACTIVE when serviceable', () => {
      const asset = createBaselineAsset({
        status: AssetStatus.UNDER_MAINTENANCE,
        condition: AssetCondition.NEEDS_REPAIR,
      });

      const serviceRecord = asset.recordMaintenance(
        {
          serviceDate: new Date('2025-06-15T10:00:00.000Z'),
          description: 'Replaced cryogenic valve assembly and recalibrated pressure regulators',
          cost: Money.create(1250.0, 'USD'),
          performedBy: 'Nordic CryoTech Field Engineering LLC',
          notes: 'Passed all pressure leak tests and electrical safety certifications.',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      expect(serviceRecord).toBeDefined();
      expect(serviceRecord.cost.amount).toBe(1250.0);
      expect(serviceRecord.performedBy).toBe('Nordic CryoTech Field Engineering LLC');
      expect(asset.maintenanceRecords).toHaveLength(1);
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
      expect(asset.status).toBe(AssetStatus.ACTIVE); // Auto-returned to ACTIVE!
      expect(asset.version).toBe(2);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(
        AssetHistoryEventType.MAINTENANCE_RECORDED,
      );

      const uncommitted = asset.getUncommittedEvents();
      expect(uncommitted.some((e) => e.eventType === 'AssetMaintenanceRecorded')).toBe(true);
    });

    it('leaves status as UNDER_MAINTENANCE if maintenance leaves condition as NEEDS_REPAIR or OUT_OF_SERVICE', () => {
      const asset = createBaselineAsset({
        status: AssetStatus.UNDER_MAINTENANCE,
        condition: AssetCondition.OUT_OF_SERVICE,
      });

      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Initial diagnostic teardown; awaiting secondary replacement part',
          cost: Money.create(300.0, 'USD'),
          performedBy: 'In-House Facilities Team',
          updateConditionTo: AssetCondition.NEEDS_REPAIR,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE); // Remains offline
      expect(asset.condition).toBe(AssetCondition.NEEDS_REPAIR);
    });

    it('FORBIDDEN: rejects maintenance recording on RETIRED or SOLD assets', () => {
      const retired = createBaselineAsset({ status: AssetStatus.ACTIVE });
      retired.retire(actorId, 'Decommissioned');
      expect(() =>
        retired.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Attempted service on retired item',
            cost: Money.create(100.0),
            performedBy: 'Vendor',
          },
          actorId,
        ),
      ).toThrow(/decommissioned fixed asset .* in state 'RETIRED'/);

      const sold = createBaselineAsset({ status: AssetStatus.ACTIVE });
      sold.sell(Money.create(5000.0), actorId, 'Sold');
      expect(() =>
        sold.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Attempted service on sold item',
            cost: Money.create(100.0),
            performedBy: 'Vendor',
          },
          actorId,
        ),
      ).toThrow(/terminal state 'SOLD'/);
    });
  });
});

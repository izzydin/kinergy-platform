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

describe('FixedAsset Domain Aggregate & Invariants', () => {
  const actorId = 'usr_lead_technician_01';
  const initialLocation = AssetLocation.create({
    facilityId: 'fac_downtown_01',
    roomId: 'room_rehab_101',
    zone: 'Zone A',
    description: 'Physical Therapy Laser Station',
  });

  describe('1. Asset Registration & Creation Invariants', () => {
    it('creates a valid FixedAsset with initial CREATED history and domain event', () => {
      const purchaseDate = new Date('2025-01-15T10:00:00Z');
      const purchaseValue = Money.create(15000.5, 'USD');

      const asset = FixedAsset.create(
        {
          assetTag: 'AST-LSR-001',
          name: 'Class IV Therapeutic Laser System',
          description: 'High-power clinical laser for deep tissue rehabilitation.',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate,
          purchaseValue,
          location: initialLocation,
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          notes: 'Covered under 3-year manufacturer warranty.',
        },
        actorId,
      );

      expect(asset.id).toBeDefined();
      expect(asset.assetTag).toBe('AST-LSR-001');
      expect(asset.name).toBe('Class IV Therapeutic Laser System');
      expect(asset.category).toBe(AssetCategory.THERAPY_EQUIPMENT);
      expect(asset.purchaseValue.amount).toBe(15000.5);
      expect(asset.currentEstimatedValue.amount).toBe(15000.5); // Defaults to purchaseValue
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.location.facilityId).toBe('fac_downtown_01');
      expect(asset.location.roomId).toBe('room_rehab_101');
      expect(asset.version).toBe(1);

      // Check initial history
      expect(asset.historyEvents).toHaveLength(1);
      expect(asset.historyEvents[0]!.eventType).toBe(AssetHistoryEventType.CREATED);
      expect(asset.historyEvents[0]!.recordedByUserId).toBe(actorId);

      // Check domain events
      const events = asset.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('AssetCreated');
    });

    it('rejects creation if actor ID is empty or whitespace', () => {
      expect(() => {
        FixedAsset.create(
          {
            assetTag: 'AST-LSR-002',
            name: 'Laser Machine',
            category: AssetCategory.THERAPY_EQUIPMENT,
            purchaseDate: new Date(),
            purchaseValue: Money.create(5000),
            location: initialLocation,
          },
          '   ',
        );
      }).toThrow(InvalidAssetStateException);
    });

    it('rejects invalid asset tag formats', () => {
      expect(() => {
        FixedAsset.create(
          {
            assetTag: '!!', // too short and invalid chars
            name: 'Laser Machine',
            category: AssetCategory.THERAPY_EQUIPMENT,
            purchaseDate: new Date(),
            purchaseValue: Money.create(5000),
            location: initialLocation,
          },
          actorId,
        );
      }).toThrow(InvalidAssetStateException);
    });

    it('rejects asset name with fewer than 2 characters', () => {
      expect(() => {
        FixedAsset.create(
          {
            assetTag: 'AST-LSR-003',
            name: 'L',
            category: AssetCategory.THERAPY_EQUIPMENT,
            purchaseDate: new Date(),
            purchaseValue: Money.create(5000),
            location: initialLocation,
          },
          actorId,
        );
      }).toThrow(InvalidAssetStateException);
    });

    it('rejects negative purchase values at the Money Value Object level [AST-INV-7]', () => {
      expect(() => {
        Money.create(-500);
      }).toThrow(InvalidMoneyException);
    });

    it('rejects empty facility ID in location value object', () => {
      expect(() => {
        AssetLocation.create({ facilityId: '   ' });
      }).toThrow(InvalidAssetLocationException);
    });
  });

  describe('2. Location Transfer Rules & History [AST-INV-3]', () => {
    it('transfers asset to a new location and records TRANSFERRED history and domain event', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-TRD-001',
          name: 'Commercial Treadmill Pro',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-06-01'),
          purchaseValue: Money.create(8500),
          location: initialLocation,
        },
        actorId,
      );

      const targetLocation = AssetLocation.create({
        facilityId: 'fac_north_branch_02',
        roomId: 'room_cardio_floor',
        zone: 'Zone C',
      });

      asset.transferLocation(
        targetLocation,
        'usr_facility_manager_09',
        'Branch relocation for summer gym expansion',
      );

      expect(asset.location.facilityId).toBe('fac_north_branch_02');
      expect(asset.location.roomId).toBe('room_cardio_floor');
      expect(asset.version).toBe(2);
      expect(asset.historyEvents).toHaveLength(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(asset.historyEvents[1]!.recordedByUserId).toBe('usr_facility_manager_09');

      const events = asset.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[1]!.eventType).toBe('AssetTransferred');
    });

    it('no-ops idempotently when transferring to the exact identical location', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-TRD-002',
          name: 'Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date(),
          purchaseValue: Money.create(5000),
          location: initialLocation,
        },
        actorId,
      );

      asset.transferLocation(initialLocation, actorId, 'Redundant transfer');

      expect(asset.version).toBe(1);
      expect(asset.historyEvents).toHaveLength(1);
    });
  });

  describe('3. Status & Condition Management [AST-INV-4], [AST-INV-5]', () => {
    it('transitions status and records STATUS_CHANGED history and domain event', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-GYM-001',
          name: 'Dual Cable Cross Machine',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-03-01'),
          purchaseValue: Money.create(6200),
          location: initialLocation,
        },
        actorId,
      );

      asset.changeStatus(
        AssetStatus.UNDER_MAINTENANCE,
        actorId,
        'Pulley cable frayed; taken down for replacement',
      );

      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);

      const events = asset.getUncommittedEvents();
      expect(events[1]!.eventType).toBe('AssetStatusChanged');
    });

    it('prohibits direct changeStatus to SOLD (must call sell() to record liquidation price)', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-GYM-002',
          name: 'Smith Machine',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date(),
          purchaseValue: Money.create(4000),
          location: initialLocation,
        },
        actorId,
      );

      expect(() => {
        asset.changeStatus(AssetStatus.SOLD, actorId, 'Sold off');
      }).toThrow(InvalidAssetStateException);
    });

    it('updates physical condition and records CONDITION_CHANGED history', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-GYM-003',
          name: 'Leg Press Station',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2023-01-01'),
          purchaseValue: Money.create(7500),
          location: initialLocation,
        },
        actorId,
      );

      asset.updateCondition(
        AssetCondition.NEEDS_REPAIR,
        actorId,
        'Bearing resistance uneven under heavy load',
      );

      expect(asset.condition).toBe(AssetCondition.NEEDS_REPAIR);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
    });
  });

  describe('4. Maintenance Recording [AST-INV-6]', () => {
    it('records maintenance, appends child record, logs history, and restores status from UNDER_MAINTENANCE to ACTIVE', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-CLIN-010',
          name: 'Shockwave Therapy Device',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2024-01-10'),
          purchaseValue: Money.create(12000),
          location: initialLocation,
          status: AssetStatus.UNDER_MAINTENANCE,
          condition: AssetCondition.NEEDS_REPAIR,
        },
        actorId,
      );

      const serviceRecord = asset.recordMaintenance(
        {
          serviceDate: new Date('2025-02-10T14:30:00Z'),
          description:
            'Replaced acoustic transmitter handpiece and calibrated pressure transducers.',
          cost: Money.create(650.0, 'USD'),
          performedBy: 'MedTech Certified Calibration Services LLC',
          notes: 'Full calibration passed within manufacturer specifications.',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      expect(serviceRecord).toBeDefined();
      expect(serviceRecord.cost.amount).toBe(650.0);
      expect(asset.maintenanceRecords).toHaveLength(1);
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
      expect(asset.status).toBe(AssetStatus.ACTIVE); // Auto-returned to ACTIVE
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.MAINTENANCE_RECORDED);

      const events = asset.getUncommittedEvents();
      expect(events[1]!.eventType).toBe('AssetMaintenanceRecorded');
    });
  });

  describe('5. Valuation Updates [AST-INV-8]', () => {
    it('updates current estimated economic value and records VALUE_UPDATED history', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-FUR-001',
          name: 'Consultation Room Executive Desk Set',
          category: AssetCategory.OFFICE_FURNITURE,
          purchaseDate: new Date('2023-01-01'),
          purchaseValue: Money.create(3000),
          location: initialLocation,
        },
        actorId,
      );

      const depreciatedValue = Money.create(2200, 'USD');
      asset.updateEstimatedValue(
        depreciatedValue,
        actorId,
        'Annual straight-line depreciation assessment',
      );

      expect(asset.currentEstimatedValue.amount).toBe(2200);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);

      const events = asset.getUncommittedEvents();
      expect(events[1]!.eventType).toBe('AssetValuationUpdated');
    });
  });

  describe('6. Terminal & Retirement Invariants [AST-INV-1], [AST-INV-2]', () => {
    it('retires asset and blocks future location transfers [AST-INV-2]', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-APP-001',
          name: 'Old Ice Machine',
          category: AssetCategory.KITCHEN_EQUIPMENT,
          purchaseDate: new Date('2020-01-01'),
          purchaseValue: Money.create(2500),
          location: initialLocation,
        },
        actorId,
      );

      asset.retire(
        actorId,
        'Refrigerant compressor failed; obsolete model not cost-effective to repair',
      );

      expect(asset.status).toBe(AssetStatus.RETIRED);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.RETIRED);

      const newLoc = AssetLocation.create({ facilityId: 'fac_storage_01' });
      expect(() => {
        asset.transferLocation(newLoc, actorId);
      }).toThrow(InvalidAssetStateException);
    });

    it('sells asset for salvage value into terminal state SOLD and prohibits any further mutations [AST-INV-1]', () => {
      const asset = FixedAsset.create(
        {
          assetTag: 'AST-SCR-001',
          name: 'Commercial Floor Scrubber',
          category: AssetCategory.CLEANING_EQUIPMENT,
          purchaseDate: new Date('2021-05-01'),
          purchaseValue: Money.create(4500),
          location: initialLocation,
        },
        actorId,
      );

      const salvageAmount = Money.create(800, 'USD');
      asset.sell(salvageAmount, actorId, 'Sold to commercial surplus auction');

      expect(asset.status).toBe(AssetStatus.SOLD);
      expect(asset.currentEstimatedValue.amount).toBe(800);
      expect(asset.version).toBe(2);
      expect(asset.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.SOLD);

      // Verify all further mutations are strictly prohibited
      const newLoc = AssetLocation.create({ facilityId: 'fac_other' });
      expect(() => asset.transferLocation(newLoc, actorId)).toThrow(InvalidAssetStateException);
      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId)).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.updateCondition(AssetCondition.GOOD, actorId)).toThrow(
        InvalidAssetStateException,
      );
      expect(() => asset.updateDetails({ name: 'Renamed' }, actorId)).toThrow(
        InvalidAssetStateException,
      );
      expect(() =>
        asset.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Fix',
            cost: Money.create(100),
            performedBy: 'Vendor',
          },
          actorId,
        ),
      ).toThrow(InvalidAssetStateException);
    });
  });
});

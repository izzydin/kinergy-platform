import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { InvalidMoneyException } from '../inventory/exceptions/invalid-money.exception';

describe('Fixed Asset Business Operations & Invariants Suite', () => {
  const actorId = 'usr_lead_clinical_engineer';
  const locationA = AssetLocation.create({
    facilityId: 'fac_central_01',
    roomId: 'room_cardio_01',
    zone: 'Zone A',
  });
  const locationB = AssetLocation.create({
    facilityId: 'fac_north_02',
    roomId: 'room_rehab_04',
    zone: 'Zone B',
  });

  const createAsset = (
    status: AssetStatus = AssetStatus.ACTIVE,
    condition: AssetCondition = AssetCondition.EXCELLENT,
  ): FixedAsset => {
    return FixedAsset.create(
      {
        assetTag: `AST-OPS-${Math.floor(Math.random() * 100000)}`,
        name: 'Hydrotherapy Whirlpool Unit',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2024-02-15T00:00:00.000Z'),
        purchaseValue: Money.create(8500),
        location: locationA,
        status,
        condition,
      },
      actorId,
    );
  };

  describe('1. Location Transfer Operations [AST-TRF-01..03]', () => {
    it('executes a valid location transfer and generates a TRANSFERRED history event', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      asset.transferLocation(
        locationB,
        actorId,
        'Relocated to North Clinic for aquatic therapy program',
      );

      expect(asset.location.equals(locationB)).toBe(true);
      expect(asset.historyEvents).toHaveLength(initialHistoryLength + 1);

      const transferEvent = asset.historyEvents.at(-1)!;
      expect(transferEvent.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(transferEvent.details).toEqual({
        priorLocation: expect.objectContaining({
          facilityId: 'fac_central_01',
          roomId: 'room_cardio_01',
        }),
        newLocation: expect.objectContaining({
          facilityId: 'fac_north_02',
          roomId: 'room_rehab_04',
        }),
        reason: 'Relocated to North Clinic for aquatic therapy program',
      });
    });

    it('performs a clean no-op when transferring to the exact same location (anti-noise)', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;
      const initialVersion = asset.version;

      asset.transferLocation(locationA, actorId, 'Redundant move');

      expect(asset.historyEvents).toHaveLength(initialHistoryLength);
      expect(asset.version).toBe(initialVersion);
    });

    it('rejects location transfer on RETIRED asset [AST-INV-6]', () => {
      const asset = createAsset();
      asset.retire(actorId, 'Decommissioned end of lifecycle');

      expect(() => {
        asset.transferLocation(locationB, actorId, 'Attempt relocation');
      }).toThrow(InvalidAssetStateException);
    });

    it('rejects location transfer on SOLD asset [AST-INV-1]', () => {
      const asset = createAsset();
      asset.sell(Money.create(2500), actorId, 'Sold at secondary auction');

      expect(() => {
        asset.transferLocation(locationB, actorId, 'Attempt relocation');
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('2. Valuation & Book Value Updates [AST-VAL-01..03]', () => {
    it('updates estimated value and generates a VALUE_UPDATED history event', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      asset.updateEstimatedValue(
        Money.create(6800),
        actorId,
        'Annual accounting depreciation adjustment',
      );

      expect(asset.currentEstimatedValue.amount).toBe(6800);
      expect(asset.historyEvents).toHaveLength(initialHistoryLength + 1);

      const valEvent = asset.historyEvents.at(-1)!;
      expect(valEvent.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);
      expect(valEvent.details).toEqual({
        priorValue: expect.objectContaining({ amount: 8500, currency: 'USD' }),
        newValue: expect.objectContaining({ amount: 6800, currency: 'USD' }),
        reason: 'Annual accounting depreciation adjustment',
      });
    });

    it('performs a no-op when new valuation equals existing valuation', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      asset.updateEstimatedValue(Money.create(8500), actorId, 'Same value');
      expect(asset.historyEvents).toHaveLength(initialHistoryLength);
    });

    it('rejects negative monetary valuation inputs', () => {
      const asset = createAsset();

      expect(() => {
        asset.updateEstimatedValue(Money.create(-100), actorId, 'Invalid negative valuation');
      }).toThrow(InvalidMoneyException);
    });

    it('rejects valuation updates on SOLD assets [AST-INV-1]', () => {
      const asset = createAsset();
      asset.sell(Money.create(2000), actorId, 'Sold');

      expect(() => {
        asset.updateEstimatedValue(Money.create(1500), actorId, 'Attempt post-sale valuation');
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('3. Condition Assessment Mutations [AST-CND-01..02]', () => {
    it('updates condition rating and records CONDITION_CHANGED history', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      asset.updateCondition(
        AssetCondition.FAIR,
        actorId,
        'Minor cosmetic scratches noted during monthly hygiene audit',
      );

      expect(asset.condition).toBe(AssetCondition.FAIR);
      expect(asset.historyEvents).toHaveLength(initialHistoryLength + 1);

      const condEvent = asset.historyEvents.at(-1)!;
      expect(condEvent.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
      expect(condEvent.details).toEqual({
        priorCondition: AssetCondition.EXCELLENT,
        newCondition: AssetCondition.FAIR,
        reason: 'Minor cosmetic scratches noted during monthly hygiene audit',
      });
    });

    it('performs a no-op when condition rating is unchanged', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      asset.updateCondition(AssetCondition.EXCELLENT, actorId, 'Still excellent');
      expect(asset.historyEvents).toHaveLength(initialHistoryLength);
    });

    it('rejects condition updates on SOLD assets [AST-INV-1]', () => {
      const asset = createAsset();
      asset.sell(Money.create(2000), actorId, 'Sold');

      expect(() => {
        asset.updateCondition(AssetCondition.GOOD, actorId, 'Try update');
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('4. Lifecycle State Machine Mutations [AST-STS-01..02]', () => {
    it('executes valid state machine transitions with mandatory justification', () => {
      const asset = createAsset();

      asset.sendToMaintenance(actorId, 'Scheduled pump seal maintenance');
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);

      asset.restoreToActive(actorId, 'Pump seal maintenance completed and tested');
      expect(asset.status).toBe(AssetStatus.ACTIVE);

      asset.markAsDamaged(actorId, 'Heating coil tripped safety breaker and failed inspection');
      expect(asset.status).toBe(AssetStatus.DAMAGED);
    });

    it('rejects invalid state machine transitions according to matrix', () => {
      const asset = createAsset();
      asset.retire(actorId, 'Decommissioned');

      // Attempting to move from RETIRED directly to UNDER_MAINTENANCE
      expect(() => {
        asset.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, 'Attempt invalid transition');
      }).toThrow(InvalidAssetStateException);
    });

    it('rejects any status transition once in SOLD terminal state', () => {
      const asset = createAsset();
      asset.sell(Money.create(1000), actorId, 'Sold');

      expect(() => {
        asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Attempt resurrect sold asset');
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('5. Comprehensive Invariant Matrix Coverage', () => {
    it('enforces operation permissions across all 5 canonical states', () => {
      const active = createAsset(AssetStatus.ACTIVE);
      const underMaint = createAsset(AssetStatus.UNDER_MAINTENANCE);
      const damaged = createAsset(AssetStatus.DAMAGED);
      const retired = createAsset(AssetStatus.ACTIVE);
      retired.retire(actorId, 'Retired');
      const sold = createAsset(AssetStatus.ACTIVE);
      sold.sell(Money.create(1500), actorId, 'Sold');

      // 1. Transfer
      expect(() => active.transferLocation(locationB, actorId)).not.toThrow();
      expect(() => underMaint.transferLocation(locationB, actorId)).not.toThrow();
      expect(() => damaged.transferLocation(locationB, actorId)).not.toThrow();
      expect(() => retired.transferLocation(locationB, actorId)).toThrow(
        InvalidAssetStateException,
      );
      expect(() => sold.transferLocation(locationB, actorId)).toThrow(InvalidAssetStateException);

      // 2. Condition update
      expect(() => active.updateCondition(AssetCondition.GOOD, actorId)).not.toThrow();
      expect(() => underMaint.updateCondition(AssetCondition.GOOD, actorId)).not.toThrow();
      expect(() => damaged.updateCondition(AssetCondition.GOOD, actorId)).not.toThrow();
      expect(() => retired.updateCondition(AssetCondition.GOOD, actorId)).not.toThrow();
      expect(() => sold.updateCondition(AssetCondition.GOOD, actorId)).toThrow(
        InvalidAssetStateException,
      );

      // 3. Valuation update
      expect(() => active.updateEstimatedValue(Money.create(5000), actorId)).not.toThrow();
      expect(() => underMaint.updateEstimatedValue(Money.create(5000), actorId)).not.toThrow();
      expect(() => damaged.updateEstimatedValue(Money.create(5000), actorId)).not.toThrow();
      expect(() => retired.updateEstimatedValue(Money.create(5000), actorId)).not.toThrow();
      expect(() => sold.updateEstimatedValue(Money.create(5000), actorId)).toThrow(
        InvalidAssetStateException,
      );

      // 4. Maintenance recording
      const mntParams = {
        serviceDate: new Date(),
        description: 'Inspection',
        cost: Money.create(100),
        performedBy: 'Tech',
      };
      expect(() => active.recordMaintenance(mntParams, actorId)).not.toThrow();
      expect(() => underMaint.recordMaintenance(mntParams, actorId)).not.toThrow();
      expect(() => damaged.recordMaintenance(mntParams, actorId)).not.toThrow();
      expect(() => retired.recordMaintenance(mntParams, actorId)).toThrow(
        InvalidAssetStateException,
      );
      expect(() => sold.recordMaintenance(mntParams, actorId)).toThrow(InvalidAssetStateException);
    });
  });
});

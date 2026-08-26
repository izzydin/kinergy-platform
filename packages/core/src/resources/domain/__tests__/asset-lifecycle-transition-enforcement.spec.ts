import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetId } from '../assets/value-objects/asset-id.vo';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';

describe('Fixed Asset Lifecycle Transition Enforcement & Invariant Tests', () => {
  const actorId = 'usr_principal_eng_01';
  const validLocation = AssetLocation.create({
    facilityId: 'fac_central_01',
    roomId: 'room_rehab_01',
  });

  const createAsset = (
    status: AssetStatus = AssetStatus.ACTIVE,
    condition: AssetCondition = AssetCondition.GOOD,
  ): FixedAsset => {
    return FixedAsset.create(
      {
        id: AssetId.create(),
        tenantId: 'tenant_kinergy_01',
        assetTag: `AST-${Math.floor(Math.random() * 900000 + 100000)}`,
        name: 'Isokinetic Dynamometer',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2024-01-10'),
        purchaseValue: Money.create(15000),
        location: validLocation,
        status,
        condition,
      },
      actorId,
    );
  };

  describe('1. Initial State Invariants', () => {
    it('permits initial creation in ACTIVE status', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.historyEvents[0]?.eventType).toBe(AssetHistoryEventType.CREATED);
    });

    it('permits initial creation in UNDER_MAINTENANCE status (pre-commissioning calibration)', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('permits initial creation in DAMAGED status (received damaged in transit)', () => {
      const asset = createAsset(AssetStatus.DAMAGED);
      expect(asset.status).toBe(AssetStatus.DAMAGED);
    });

    it('strictly rejects initial creation in RETIRED status', () => {
      expect(() => createAsset(AssetStatus.RETIRED)).toThrow(InvalidAssetStateException);
    });

    it('strictly rejects initial creation in SOLD status', () => {
      expect(() => createAsset(AssetStatus.SOLD)).toThrow(InvalidAssetStateException);
    });
  });

  describe('2. All Allowed Transitions in 5x5 Matrix', () => {
    it('ACTIVE -> UNDER_MAINTENANCE', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.sendToMaintenance(actorId, 'Routine 6-month calibration');
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      expect(asset.historyEvents.at(-1)?.details).toEqual(
        expect.objectContaining({
          priorStatus: AssetStatus.ACTIVE,
          newStatus: AssetStatus.UNDER_MAINTENANCE,
        }),
      );
    });

    it('ACTIVE -> DAMAGED', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.markAsDamaged(actorId, 'Load cell failure during exercise');
      expect(asset.status).toBe(AssetStatus.DAMAGED);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });

    it('ACTIVE -> RETIRED', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned due to age');
      expect(asset.status).toBe(AssetStatus.RETIRED);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.RETIRED);
    });

    it('ACTIVE -> SOLD', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.sell(Money.create(8000), actorId, 'Direct sale to university clinic');
      expect(asset.status).toBe(AssetStatus.SOLD);
      expect(asset.currentEstimatedValue.amount).toBe(8000);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
    });

    it('UNDER_MAINTENANCE -> ACTIVE', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.GOOD);
      asset.restoreToActive(actorId, 'Calibration completed successfully');
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });

    it('UNDER_MAINTENANCE -> DAMAGED', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.markAsDamaged(actorId, 'Cracked frame discovered during overhaul');
      expect(asset.status).toBe(AssetStatus.DAMAGED);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });

    it('UNDER_MAINTENANCE -> RETIRED', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.retire(actorId, 'Repair cost exceeds threshold (Beyond Economic Repair)');
      expect(asset.status).toBe(AssetStatus.RETIRED);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.RETIRED);
    });

    it('UNDER_MAINTENANCE -> SOLD', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE);
      asset.sell(Money.create(1200), actorId, 'Sold as-is for spare parts');
      expect(asset.status).toBe(AssetStatus.SOLD);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
    });

    it('DAMAGED -> UNDER_MAINTENANCE', () => {
      const asset = createAsset(AssetStatus.DAMAGED);
      asset.sendToMaintenance(actorId, 'Sent to authorized repair shop');
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });

    it('DAMAGED -> ACTIVE (when condition is serviceable)', () => {
      const asset = createAsset(AssetStatus.DAMAGED, AssetCondition.FAIR);
      asset.restoreToActive(actorId, 'False alarm cleared; physical inspection passed');
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
    });

    it('DAMAGED -> RETIRED', () => {
      const asset = createAsset(AssetStatus.DAMAGED);
      asset.retire(actorId, 'Total loss write-off');
      expect(asset.status).toBe(AssetStatus.RETIRED);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.RETIRED);
    });

    it('DAMAGED -> SOLD', () => {
      const asset = createAsset(AssetStatus.DAMAGED);
      asset.sell(Money.create(300), actorId, 'Scrap metal recycling sale');
      expect(asset.status).toBe(AssetStatus.SOLD);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
    });

    it('RETIRED -> SOLD (Salvage liquidation)', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned surplus');
      expect(asset.status).toBe(AssetStatus.RETIRED);

      asset.sell(Money.create(500), actorId, 'Surplus auction liquidation');
      expect(asset.status).toBe(AssetStatus.SOLD);
      expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
    });
  });

  describe('3. Forbidden Transitions in 5x5 Matrix', () => {
    it('rejects self-transitions (no-op status mutations)', () => {
      const activeAsset = createAsset(AssetStatus.ACTIVE);
      expect(() => activeAsset.changeStatus(AssetStatus.ACTIVE, actorId, 'Same state')).toThrow(
        /already in 'ACTIVE' status/,
      );

      const maintAsset = createAsset(AssetStatus.UNDER_MAINTENANCE);
      expect(() =>
        maintAsset.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, 'Same state'),
      ).toThrow(/already in 'UNDER_MAINTENANCE' status/);

      const damagedAsset = createAsset(AssetStatus.DAMAGED);
      expect(() => damagedAsset.changeStatus(AssetStatus.DAMAGED, actorId, 'Same state')).toThrow(
        /already in 'DAMAGED' status/,
      );
    });

    it('rejects RETIRED -> ACTIVE (accounting prohibition)', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Try activate')).toThrow(
        InvalidAssetStateException,
      );
    });

    it('rejects RETIRED -> UNDER_MAINTENANCE', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      expect(() =>
        asset.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, 'Try maintain'),
      ).toThrow(InvalidAssetStateException);
    });

    it('rejects RETIRED -> DAMAGED', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      expect(() => asset.changeStatus(AssetStatus.DAMAGED, actorId, 'Try damage')).toThrow(
        InvalidAssetStateException,
      );
    });

    it('rejects RETIRED -> RETIRED', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      expect(() => asset.retire(actorId, 'Retire again')).toThrow(InvalidAssetStateException);
    });

    it('rejects ALL transitions once SOLD (Terminal Sink State)', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.sell(Money.create(5000), actorId, 'Sold');

      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Activate')).toThrow(
        /terminal state 'SOLD'/,
      );
      expect(() => asset.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, 'Maintain')).toThrow(
        /terminal state 'SOLD'/,
      );
      expect(() => asset.changeStatus(AssetStatus.DAMAGED, actorId, 'Damage')).toThrow(
        /terminal state 'SOLD'/,
      );
      expect(() => asset.changeStatus(AssetStatus.RETIRED, actorId, 'Retire')).toThrow(
        /terminal state 'SOLD'/,
      );
      expect(() => asset.sell(Money.create(1000), actorId, 'Sell again')).toThrow(
        /terminal state 'SOLD'/,
      );
    });
  });

  describe('4. Bypass Vectors & Invariant Guard Protections', () => {
    it('prohibits bypassing restoreToActive via changeStatus when condition is OUT_OF_SERVICE', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.OUT_OF_SERVICE);

      expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Bypass attempt')).toThrow(
        /Cannot restore fixed asset .* to ACTIVE while condition is 'OUT_OF_SERVICE'/,
      );
    });

    it('prohibits direct changeStatus to SOLD without realization value', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      expect(() => asset.changeStatus(AssetStatus.SOLD, actorId, 'Direct sold attempt')).toThrow(
        /Direct status change to 'SOLD' is prohibited. Use the sell\(\) method/,
      );
    });

    it('prohibits updating condition on a RETIRED asset [AST-INV-8]', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');

      expect(() => asset.updateCondition(AssetCondition.EXCELLENT, actorId)).toThrow(
        /Cannot update condition of decommissioned fixed asset .* in state 'RETIRED'/,
      );
    });

    it('prohibits physical location transfers on a RETIRED asset [AST-INV-6]', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');

      const newLoc = AssetLocation.create({ facilityId: 'fac_main_02' });
      expect(() => asset.transferLocation(newLoc, actorId)).toThrow(
        /Cannot transfer decommissioned fixed asset .* in state 'RETIRED'/,
      );
    });

    it('prohibits maintenance records on a RETIRED asset [AST-INV-7]', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');

      expect(() =>
        asset.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Attempted service on retired item',
            cost: Money.create(100),
            performedBy: 'Vendor X',
          },
          actorId,
        ),
      ).toThrow(/Cannot perform maintenance on decommissioned fixed asset .* in state 'RETIRED'/);
    });

    it('rejects status changes with blank or short reasons (< 3 characters)', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      expect(() => asset.sendToMaintenance(actorId, '')).toThrow(
        /Mandatory reason for status change must be at least 3 characters/,
      );
      expect(() => asset.sendToMaintenance(actorId, 'no')).toThrow(
        /Mandatory reason for status change must be at least 3 characters/,
      );
    });

    it('rejects status changes without an authenticated actor', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      expect(() => asset.sendToMaintenance('', 'Valid reason')).toThrow(
        /Authenticated actor ID is mandatory/,
      );
    });
  });
});

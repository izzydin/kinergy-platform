import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { AssetLifecycleStateMachine } from '../assets/services/asset-lifecycle.state-machine';

describe('Fixed Asset Lifecycle Finite State Machine & Transition Invariants', () => {
  const actorId = 'usr_lead_architect_01';
  const defaultLocation = AssetLocation.create({
    facilityId: 'fac_main_01',
    roomId: 'room_strength_01',
  });

  const createTestAsset = (
    initialStatus: AssetStatus = AssetStatus.ACTIVE,
    condition: AssetCondition = AssetCondition.GOOD,
  ): FixedAsset => {
    return FixedAsset.create(
      {
        assetTag: `AST-TEST-${Math.floor(Math.random() * 100000)}`,
        name: 'Olympic Power Rack',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2024-01-15'),
        purchaseValue: Money.create(3500),
        location: defaultLocation,
        status: initialStatus,
        condition,
      },
      actorId,
    );
  };

  describe('1. Initial State Invariants', () => {
    it('allows valid initial statuses: ACTIVE, UNDER_MAINTENANCE, and DAMAGED', () => {
      expect(createTestAsset(AssetStatus.ACTIVE).status).toBe(AssetStatus.ACTIVE);
      expect(createTestAsset(AssetStatus.UNDER_MAINTENANCE).status).toBe(
        AssetStatus.UNDER_MAINTENANCE,
      );
      expect(createTestAsset(AssetStatus.DAMAGED).status).toBe(AssetStatus.DAMAGED);
    });

    it('prohibits initial aggregate creation directly as RETIRED or SOLD', () => {
      expect(() => createTestAsset(AssetStatus.RETIRED)).toThrow(InvalidAssetStateException);
      expect(() => createTestAsset(AssetStatus.SOLD)).toThrow(InvalidAssetStateException);
    });

    it('exposes accurate allowed initial statuses in AssetLifecycleStateMachine', () => {
      expect(AssetLifecycleStateMachine.VALID_INITIAL_STATUSES.has(AssetStatus.ACTIVE)).toBe(true);
      expect(
        AssetLifecycleStateMachine.VALID_INITIAL_STATUSES.has(AssetStatus.UNDER_MAINTENANCE),
      ).toBe(true);
      expect(AssetLifecycleStateMachine.VALID_INITIAL_STATUSES.has(AssetStatus.DAMAGED)).toBe(true);
      expect(AssetLifecycleStateMachine.VALID_INITIAL_STATUSES.has(AssetStatus.RETIRED)).toBe(
        false,
      );
      expect(AssetLifecycleStateMachine.VALID_INITIAL_STATUSES.has(AssetStatus.SOLD)).toBe(false);
    });
  });

  describe('2. Valid State Transitions Matrix', () => {
    describe('Transitions from ACTIVE', () => {
      it('transitions ACTIVE -> UNDER_MAINTENANCE via sendToMaintenance', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.sendToMaintenance(actorId, 'Scheduled 90-day cable tension inspection');

        expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      });

      it('transitions ACTIVE -> DAMAGED via markAsDamaged', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.markAsDamaged(actorId, 'Guide rod bent during heavy drop incident');

        expect(asset.status).toBe(AssetStatus.DAMAGED);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      });

      it('transitions ACTIVE -> RETIRED via retire', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.retire(actorId, 'Replaced by upgraded biomechanics station');

        expect(asset.status).toBe(AssetStatus.RETIRED);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.RETIRED);
      });

      it('transitions ACTIVE -> SOLD via sell', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.sell(Money.create(2000), actorId, 'Direct liquidation sale to affiliate gym');

        expect(asset.status).toBe(AssetStatus.SOLD);
        expect(asset.currentEstimatedValue.amount).toBe(2000);
        expect(asset.historyEvents.at(-1)?.eventType).toBe(AssetHistoryEventType.SOLD);
      });
    });

    describe('Transitions from UNDER_MAINTENANCE', () => {
      it('transitions UNDER_MAINTENANCE -> ACTIVE via restoreToActive', () => {
        const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE);
        asset.restoreToActive(actorId, 'Preventive lubrication complete; returned to floor');

        expect(asset.status).toBe(AssetStatus.ACTIVE);
      });

      it('transitions UNDER_MAINTENANCE -> DAMAGED via markAsDamaged (Failed Repair)', () => {
        const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE);
        asset.markAsDamaged(actorId, 'Motor diagnostic revealed cracked casing during overhaul');

        expect(asset.status).toBe(AssetStatus.DAMAGED);
      });

      it('transitions UNDER_MAINTENANCE -> RETIRED via retire (BER Write-off)', () => {
        const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE);
        asset.retire(
          actorId,
          'Repair estimate exceeds 80% replacement value (Beyond Economic Repair)',
        );

        expect(asset.status).toBe(AssetStatus.RETIRED);
      });

      it('transitions UNDER_MAINTENANCE -> SOLD via sell (As-Is Parts Sale)', () => {
        const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE);
        asset.sell(Money.create(500), actorId, 'Sold as-is to equipment refurbisher');

        expect(asset.status).toBe(AssetStatus.SOLD);
      });
    });

    describe('Transitions from DAMAGED', () => {
      it('transitions DAMAGED -> UNDER_MAINTENANCE via sendToMaintenance', () => {
        const asset = createTestAsset(AssetStatus.DAMAGED);
        asset.sendToMaintenance(actorId, 'Dispatched to specialized hydraulics technician');

        expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      });

      it('transitions DAMAGED -> ACTIVE via restoreToActive when condition is serviceable', () => {
        const asset = createTestAsset(AssetStatus.DAMAGED, AssetCondition.GOOD);
        asset.restoreToActive(actorId, 'Tested and verified operational');

        expect(asset.status).toBe(AssetStatus.ACTIVE);
      });

      it('transitions DAMAGED -> RETIRED via retire (Total Loss)', () => {
        const asset = createTestAsset(AssetStatus.DAMAGED);
        asset.retire(actorId, 'Frame bent beyond factory tolerances; written off as total loss');

        expect(asset.status).toBe(AssetStatus.RETIRED);
      });

      it('transitions DAMAGED -> SOLD via sell (Scrap Sale)', () => {
        const asset = createTestAsset(AssetStatus.DAMAGED);
        asset.sell(Money.create(150), actorId, 'Sold to scrap metal recycler');

        expect(asset.status).toBe(AssetStatus.SOLD);
      });
    });

    describe('Transitions from RETIRED', () => {
      it('transitions RETIRED -> SOLD via sell (Salvage Liquidation)', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.retire(actorId, 'Decommissioned from service');
        expect(asset.status).toBe(AssetStatus.RETIRED);

        asset.sell(
          Money.create(800),
          actorId,
          'Auction liquidation of surplus decommissioned asset',
        );
        expect(asset.status).toBe(AssetStatus.SOLD);
        expect(asset.currentEstimatedValue.amount).toBe(800);
      });
    });
  });

  describe('3. Invalid State Transitions & Rejection Matrix', () => {
    describe('Prohibited transitions from RETIRED', () => {
      it('prohibits RETIRED -> ACTIVE (accounting reactivation prohibition)', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.retire(actorId, 'End of life');

        expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Reactivate')).toThrow(
          InvalidAssetStateException,
        );
        expect(() => asset.restoreToActive(actorId, 'Reactivate')).toThrow(
          InvalidAssetStateException,
        );
      });

      it('prohibits RETIRED -> UNDER_MAINTENANCE (decommissioned assets cannot be serviced)', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.retire(actorId, 'End of life');

        expect(() => asset.sendToMaintenance(actorId, 'Service retired item')).toThrow(
          InvalidAssetStateException,
        );
      });

      it('prohibits RETIRED -> DAMAGED', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.retire(actorId, 'End of life');

        expect(() => asset.markAsDamaged(actorId, 'Damage')).toThrow(InvalidAssetStateException);
      });
    });

    describe('Prohibited transitions from SOLD (Terminal Sink State)', () => {
      it('prohibits ALL transitions and mutations once SOLD', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        asset.sell(Money.create(1000), actorId, 'Sold');

        expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'Reactivate')).toThrow(
          /terminal state 'SOLD'/,
        );
        expect(() => asset.sendToMaintenance(actorId, 'Repair')).toThrow(/terminal state 'SOLD'/);
        expect(() => asset.markAsDamaged(actorId, 'Damage')).toThrow(/terminal state 'SOLD'/);
        expect(() => asset.retire(actorId, 'Retire')).toThrow(/terminal state 'SOLD'/);
        expect(() => asset.sell(Money.create(500), actorId, 'Sell again')).toThrow(
          /terminal state 'SOLD'/,
        );
        expect(() => asset.transferLocation(defaultLocation, actorId)).toThrow(
          /terminal state 'SOLD'/,
        );
      });
    });

    describe('Prohibited Self-Transitions (Repeated Status)', () => {
      it('rejects identical repeated status transition attempts', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        expect(() => asset.changeStatus(AssetStatus.ACTIVE, actorId, 'No-op transition')).toThrow(
          /already in 'ACTIVE' status/,
        );
      });
    });

    describe('Direct changeStatus to SOLD Prohibited', () => {
      it('enforces that liquidation must go through sell() method with realized valuation', () => {
        const asset = createTestAsset(AssetStatus.ACTIVE);
        expect(() => asset.changeStatus(AssetStatus.SOLD, actorId, 'Direct sold attempt')).toThrow(
          /Direct status change to 'SOLD' is prohibited/,
        );
      });
    });
  });

  describe('4. Status vs Condition Orthogonality & Guard Invariants', () => {
    it('prohibits restoring to ACTIVE if condition is OUT_OF_SERVICE', () => {
      const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.OUT_OF_SERVICE);

      expect(() => asset.restoreToActive(actorId, 'Try return to active')).toThrow(
        /Cannot restore fixed asset .* to ACTIVE while condition is 'OUT_OF_SERVICE'/,
      );
    });

    it('allows ACTIVE status with FAIR condition (wear-and-tear operating baseline)', () => {
      const asset = createTestAsset(AssetStatus.ACTIVE, AssetCondition.FAIR);
      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.condition).toBe(AssetCondition.FAIR);
    });

    it('allows UNDER_MAINTENANCE with GOOD condition (routine preventative servicing)', () => {
      const asset = createTestAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.GOOD);
      expect(asset.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(asset.condition).toBe(AssetCondition.GOOD);
    });
  });

  describe('5. History Integrity & Atomicity Verification', () => {
    it('appends an immutable history event on every valid state transition', () => {
      const asset = createTestAsset(AssetStatus.ACTIVE);
      const initialHistoryCount = asset.historyEvents.length;

      asset.sendToMaintenance(actorId, 'Lubrication and calibration');
      expect(asset.historyEvents.length).toBe(initialHistoryCount + 1);

      const latestEvent = asset.historyEvents.at(-1);
      expect(latestEvent?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      expect(latestEvent?.recordedByUserId).toBe(actorId);
      expect(latestEvent?.details).toEqual(
        expect.objectContaining({
          priorStatus: AssetStatus.ACTIVE,
          newStatus: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Lubrication and calibration',
        }),
      );
    });

    it('does NOT append history when an illegal transition is rejected', () => {
      const asset = createTestAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned');
      const historyCountAfterRetire = asset.historyEvents.length;

      expect(() => asset.restoreToActive(actorId, 'Illegal activation')).toThrow();
      expect(asset.historyEvents.length).toBe(historyCountAfterRetire);
    });
  });
});

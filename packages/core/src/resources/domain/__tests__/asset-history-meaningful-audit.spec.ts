import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { AssetHistoryEvent } from '../assets/entities/asset-history-event.entity';

describe('Fixed Asset Meaningful History & Audit Trail', () => {
  const actorId = 'usr_facility_manager_01';
  const initialLocation = AssetLocation.create({
    facilityId: 'fac_central_01',
    roomId: 'room_cardio_01',
    zone: 'Zone A',
  });

  const createBaseAsset = (): FixedAsset => {
    return FixedAsset.create(
      {
        assetTag: `AST-HST-${Math.floor(Math.random() * 100000)}`,
        name: 'Commercial Treadmill Pro',
        description: 'Heavy duty commercial running machine',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2024-01-10T00:00:00.000Z'),
        purchaseValue: Money.create(5500),
        location: initialLocation,
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        notes: 'Initial delivery from Matrix Fitness',
      },
      actorId,
    );
  };

  describe('1. CREATED Event Provenance & Snapshot', () => {
    it('records a CREATED event on aggregate creation with full initial snapshot payload', () => {
      const asset = createBaseAsset();

      expect(asset.historyEvents).toHaveLength(1);
      const createdEvent = asset.historyEvents[0]!;

      expect(createdEvent.eventType).toBe(AssetHistoryEventType.CREATED);
      expect(createdEvent.recordedByUserId).toBe(actorId);
      expect(createdEvent.recordedAt).toBeInstanceOf(Date);
      expect(createdEvent.description).toContain('Asset registered and commissioned');

      expect(createdEvent.details).toEqual(
        expect.objectContaining({
          assetTag: asset.assetTag,
          category: AssetCategory.GYM_EQUIPMENT,
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          purchaseValue: expect.objectContaining({ amount: 5500, currency: 'USD' }),
          location: expect.objectContaining({
            facilityId: 'fac_central_01',
            roomId: 'room_cardio_01',
            zone: 'Zone A',
          }),
        }),
      );
    });
  });

  describe('2. Meaningful UPDATED Events vs Anti-Noise No-Ops', () => {
    it('records an UPDATED event with changedFields diff when metadata changes', () => {
      const asset = createBaseAsset();

      asset.updateDetails(
        {
          name: 'Commercial Treadmill Pro II',
          notes: 'Added extended warranty coverage through 2028',
        },
        actorId,
        'Annual warranty extension and name refinement',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const updateEvent = asset.historyEvents[1]!;

      expect(updateEvent.eventType).toBe(AssetHistoryEventType.UPDATED);
      expect(updateEvent.recordedByUserId).toBe(actorId);
      expect(updateEvent.description).toContain('Asset details updated');

      expect(updateEvent.details).toEqual({
        changedFields: {
          name: {
            from: 'Commercial Treadmill Pro',
            to: 'Commercial Treadmill Pro II',
          },
          notes: {
            from: 'Initial delivery from Matrix Fitness',
            to: 'Added extended warranty coverage through 2028',
          },
        },
        reason: 'Annual warranty extension and name refinement',
      });
    });

    it('produces NO history event and does NOT bump version when updateDetails is a no-op (anti-noise)', () => {
      const asset = createBaseAsset();
      const initialVersion = asset.version;
      const initialHistoryLength = asset.historyEvents.length;

      // Update with identical values
      asset.updateDetails(
        {
          name: 'Commercial Treadmill Pro',
          description: 'Heavy duty commercial running machine',
          notes: 'Initial delivery from Matrix Fitness',
        },
        actorId,
        'Redundant save',
      );

      expect(asset.historyEvents).toHaveLength(initialHistoryLength);
      expect(asset.version).toBe(initialVersion);
    });
  });

  describe('3. TRANSFERRED Event Provenance', () => {
    it('records a TRANSFERRED event with prior and new locations', () => {
      const asset = createBaseAsset();
      const targetLocation = AssetLocation.create({
        facilityId: 'fac_north_02',
        roomId: 'room_rehab_03',
        zone: 'Zone B',
      });

      asset.transferLocation(
        targetLocation,
        actorId,
        'Relocated to North Clinic for specialized rehab',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const transferEvent = asset.historyEvents[1]!;

      expect(transferEvent.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(transferEvent.recordedByUserId).toBe(actorId);
      expect(transferEvent.description).toContain('Location transferred');

      expect(transferEvent.details).toEqual({
        priorLocation: expect.objectContaining({
          facilityId: 'fac_central_01',
          roomId: 'room_cardio_01',
        }),
        newLocation: expect.objectContaining({
          facilityId: 'fac_north_02',
          roomId: 'room_rehab_03',
        }),
        reason: 'Relocated to North Clinic for specialized rehab',
      });
    });

    it('produces NO history event when transferring to identical location (no-op)', () => {
      const asset = createBaseAsset();
      const sameLocation = AssetLocation.create({
        facilityId: 'fac_central_01',
        roomId: 'room_cardio_01',
        zone: 'Zone A',
      });

      asset.transferLocation(sameLocation, actorId, 'Same location transfer');
      expect(asset.historyEvents).toHaveLength(1);
    });
  });

  describe('4. STATUS_CHANGED Event Provenance', () => {
    it('records a STATUS_CHANGED event with priorStatus, newStatus, and mandatory reason', () => {
      const asset = createBaseAsset();

      asset.sendToMaintenance(actorId, 'Scheduled 90-day belt alignment and motor check');

      expect(asset.historyEvents).toHaveLength(2);
      const statusEvent = asset.historyEvents[1]!;

      expect(statusEvent.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      expect(statusEvent.recordedByUserId).toBe(actorId);
      expect(statusEvent.details).toEqual({
        priorStatus: AssetStatus.ACTIVE,
        newStatus: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Scheduled 90-day belt alignment and motor check',
      });
    });
  });

  describe('5. CONDITION_CHANGED Event Provenance', () => {
    it('records a CONDITION_CHANGED event with priorCondition and newCondition', () => {
      const asset = createBaseAsset();

      asset.updateCondition(
        AssetCondition.FAIR,
        actorId,
        'Running belt shows surface cosmetic fraying',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const conditionEvent = asset.historyEvents[1]!;

      expect(conditionEvent.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
      expect(conditionEvent.recordedByUserId).toBe(actorId);
      expect(conditionEvent.details).toEqual({
        priorCondition: AssetCondition.EXCELLENT,
        newCondition: AssetCondition.FAIR,
        reason: 'Running belt shows surface cosmetic fraying',
      });
    });

    it('produces NO history event when condition is unchanged', () => {
      const asset = createBaseAsset();

      asset.updateCondition(AssetCondition.EXCELLENT, actorId, 'Still excellent');
      expect(asset.historyEvents).toHaveLength(1);
    });
  });

  describe('6. VALUE_UPDATED Event Provenance', () => {
    it('records a VALUE_UPDATED event with priorValue, newValue, and reason', () => {
      const asset = createBaseAsset();

      asset.updateEstimatedValue(
        Money.create(4200),
        actorId,
        'Annual straight-line depreciation adjustment for FY2026',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const valueEvent = asset.historyEvents[1]!;

      expect(valueEvent.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);
      expect(valueEvent.recordedByUserId).toBe(actorId);
      expect(valueEvent.details).toEqual({
        priorValue: expect.objectContaining({ amount: 5500, currency: 'USD' }),
        newValue: expect.objectContaining({ amount: 4200, currency: 'USD' }),
        reason: 'Annual straight-line depreciation adjustment for FY2026',
      });
    });

    it('produces NO history event when value is identical', () => {
      const asset = createBaseAsset();

      asset.updateEstimatedValue(Money.create(5500), actorId, 'Identical value');
      expect(asset.historyEvents).toHaveLength(1);
    });
  });

  describe('7. MAINTENANCE_RECORDED Event Provenance', () => {
    it('records a MAINTENANCE_RECORDED event with maintenanceRecordId, cost, technician, and service date', () => {
      const asset = createBaseAsset();

      const record = asset.recordMaintenance(
        {
          serviceDate: new Date('2026-05-15T10:00:00.000Z'),
          description: 'Replaced running deck and drive motor capacitor',
          cost: Money.create(380),
          performedBy: 'Matrix Certified Technician #412',
          notes: 'Parts covered under manufacturer warranty; labor billed.',
          updateConditionTo: AssetCondition.GOOD,
        },
        actorId,
      );

      expect(asset.historyEvents).toHaveLength(2);
      const maintenanceEvent = asset.historyEvents[1]!;

      expect(maintenanceEvent.eventType).toBe(AssetHistoryEventType.MAINTENANCE_RECORDED);
      expect(maintenanceEvent.recordedByUserId).toBe(actorId);
      expect(maintenanceEvent.details).toEqual({
        maintenanceRecordId: record.id.value,
        cost: expect.objectContaining({ amount: 380, currency: 'USD' }),
        performedBy: 'Matrix Certified Technician #412',
        serviceDate: '2026-05-15T10:00:00.000Z',
      });
    });
  });

  describe('8. RETIRED & SOLD Event Provenance', () => {
    it('records a RETIRED event with priorStatus, newStatus, and mandatory justification', () => {
      const asset = createBaseAsset();

      asset.retire(
        actorId,
        'Facility upgrade: replaced by next-generation smart connected treadmills',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const retireEvent = asset.historyEvents[1]!;

      expect(retireEvent.eventType).toBe(AssetHistoryEventType.RETIRED);
      expect(retireEvent.recordedByUserId).toBe(actorId);
      expect(retireEvent.details).toEqual({
        priorStatus: AssetStatus.ACTIVE,
        newStatus: AssetStatus.RETIRED,
        reason: 'Facility upgrade: replaced by next-generation smart connected treadmills',
      });
    });

    it('records a SOLD event with liquidation proceeds, prior valuation, and realization reason', () => {
      const asset = createBaseAsset();

      asset.sell(
        Money.create(1800),
        actorId,
        'Sold at secondary fitness equipment auction to Regional Health Club',
      );

      expect(asset.historyEvents).toHaveLength(2);
      const soldEvent = asset.historyEvents[1]!;

      expect(soldEvent.eventType).toBe(AssetHistoryEventType.SOLD);
      expect(soldEvent.recordedByUserId).toBe(actorId);
      expect(soldEvent.details).toEqual({
        priorStatus: AssetStatus.ACTIVE,
        newStatus: AssetStatus.SOLD,
        priorEstimatedValue: expect.objectContaining({ amount: 5500, currency: 'USD' }),
        saleAmount: expect.objectContaining({ amount: 1800, currency: 'USD' }),
        reason: 'Sold at secondary fitness equipment auction to Regional Health Club',
      });
    });
  });

  describe('9. Immutability & Reconstitution Fidelity', () => {
    it('freezes AssetHistoryEvent instances preventing mutation of audit records', () => {
      const asset = createBaseAsset();
      const event = asset.historyEvents[0]!;

      expect(Object.isFrozen(event)).toBe(true);
      expect(() => {
        (event as unknown as Record<string, unknown>)['_description'] = 'Tampered description';
      }).toThrow();
    });

    it('serializes to JSON cleanly with all audit fields', () => {
      const asset = createBaseAsset();
      const event = asset.historyEvents[0]!;
      const json = event.toJSON();

      expect(json).toEqual({
        id: event.id.value,
        assetId: asset.id.value,
        eventType: AssetHistoryEventType.CREATED,
        description: expect.any(String),
        details: expect.any(Object),
        recordedByUserId: actorId,
        recordedAt: expect.any(String),
      });
    });

    it('reconstitutes history events faithfully without losing metadata', () => {
      const asset = createBaseAsset();
      const originalEvent = asset.historyEvents[0]!;

      const reconstituted = AssetHistoryEvent.reconstitute({
        id: originalEvent.id,
        assetId: originalEvent.assetId,
        eventType: originalEvent.eventType,
        description: originalEvent.description,
        details: originalEvent.details,
        recordedByUserId: originalEvent.recordedByUserId,
        recordedAt: originalEvent.recordedAt,
      });

      expect(reconstituted.id.equals(originalEvent.id)).toBe(true);
      expect(reconstituted.eventType).toBe(originalEvent.eventType);
      expect(reconstituted.description).toBe(originalEvent.description);
      expect(reconstituted.recordedByUserId).toBe(originalEvent.recordedByUserId);
      expect(reconstituted.recordedAt.getTime()).toBe(originalEvent.recordedAt.getTime());
      expect(reconstituted.details).toEqual(originalEvent.details);
    });
  });

  describe('10. Atomicity & Invariant Failure Rejection', () => {
    it('does NOT append any history event when an operation fails invariant validation', () => {
      const asset = createBaseAsset();
      asset.sell(Money.create(1000), actorId, 'Sold');
      const historyLength = asset.historyEvents.length;

      // Attempting an illegal mutation on sold asset
      expect(() => {
        asset.updateCondition(AssetCondition.GOOD, actorId, 'Try update');
      }).toThrow(InvalidAssetStateException);

      expect(asset.historyEvents).toHaveLength(historyLength);
    });
  });
});

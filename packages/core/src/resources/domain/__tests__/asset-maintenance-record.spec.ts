import { AssetStatus } from '../assets/enums/asset-status.enum';
import { AssetCategory } from '../assets/enums/asset-category.enum';
import { AssetCondition } from '../assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../assets/enums/asset-history-event-type.enum';
import { FixedAsset } from '../assets/fixed-asset.aggregate';
import { AssetLocation } from '../assets/value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { InvalidAssetStateException } from '../assets/exceptions/invalid-asset-state.exception';
import { AssetMaintenanceRecord } from '../assets/entities/asset-maintenance-record.entity';

describe('Fixed Asset Maintenance Record & Service Tracking', () => {
  const actorId = 'usr_maintenance_lead_01';
  const location = AssetLocation.create({
    facilityId: 'fac_central_01',
    roomId: 'room_physio_02',
  });

  const createAsset = (
    status: AssetStatus = AssetStatus.ACTIVE,
    condition: AssetCondition = AssetCondition.GOOD,
  ): FixedAsset => {
    return FixedAsset.create(
      {
        assetTag: `AST-MNT-${Math.floor(Math.random() * 100000)}`,
        name: 'Shockwave Therapy Generator',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2023-06-01T00:00:00.000Z'),
        purchaseValue: Money.create(12000),
        location,
        status,
        condition,
      },
      actorId,
    );
  };

  describe('1. Maintenance Record Creation & Required Field Validation', () => {
    it('creates an immutable maintenance record with all valid attributes', () => {
      const asset = createAsset();
      const serviceDate = new Date('2026-03-10T14:30:00.000Z');

      const record = asset.recordMaintenance(
        {
          serviceDate,
          description: 'Acoustic applicator head replacement and pressure calibration',
          cost: Money.create(650),
          performedBy: 'Storz Medical Certified Field Engineer',
          notes: 'Applicator replaced under warranty service contract #8812',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      expect(record.id).toBeDefined();
      expect(record.assetId.equals(asset.id)).toBe(true);
      expect(record.serviceDate.toISOString()).toBe(serviceDate.toISOString());
      expect(record.description).toBe(
        'Acoustic applicator head replacement and pressure calibration',
      );
      expect(record.cost.amount).toBe(650);
      expect(record.performedBy).toBe('Storz Medical Certified Field Engineer');
      expect(record.notes).toBe('Applicator replaced under warranty service contract #8812');
      expect(record.recordedByUserId).toBe(actorId);
      expect(record.createdAt).toBeInstanceOf(Date);

      expect(Object.isFrozen(record)).toBe(true);
    });

    it('rejects creation when description is too short or empty', () => {
      expect(() => {
        AssetMaintenanceRecord.create({
          assetId: createAsset().id,
          serviceDate: new Date(),
          description: 'No',
          cost: Money.create(100),
          performedBy: 'Technician',
          recordedByUserId: actorId,
        });
      }).toThrow(/description must be at least 3 characters/);
    });

    it('rejects creation when performedBy is empty', () => {
      expect(() => {
        AssetMaintenanceRecord.create({
          assetId: createAsset().id,
          serviceDate: new Date(),
          description: 'Routine inspection',
          cost: Money.create(100),
          performedBy: '   ',
          recordedByUserId: actorId,
        });
      }).toThrow(/PerformedBy technician or service provider is mandatory/);
    });

    it('rejects creation when recordedByUserId is missing', () => {
      expect(() => {
        AssetMaintenanceRecord.create({
          assetId: createAsset().id,
          serviceDate: new Date(),
          description: 'Routine inspection',
          cost: Money.create(100),
          performedBy: 'Technician',
          recordedByUserId: '',
        });
      }).toThrow(/RecordedByUserId is mandatory/);
    });

    it('rejects invalid negative maintenance costs', () => {
      expect(() => {
        Money.create(-50);
      }).toThrow(/non-negative/);
    });

    it('allows zero-cost in-house maintenance servicing ($0.00)', () => {
      const asset = createAsset();
      const record = asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'In-house visual safety audit and cable check',
          cost: Money.zero(),
          performedBy: 'Internal Facility Staff',
        },
        actorId,
      );

      expect(record.cost.amount).toBe(0);
      expect(record.cost.isZero()).toBe(true);
    });
  });

  describe('2. Asset Lifecycle Status Interaction & Restoration Rules', () => {
    it('allows maintenance on ACTIVE asset and keeps status ACTIVE', () => {
      const asset = createAsset(AssetStatus.ACTIVE, AssetCondition.GOOD);

      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Preventive monthly lubrication',
          cost: Money.create(75),
          performedBy: 'Facility Team',
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.maintenanceRecords).toHaveLength(1);
    });

    it('automatically restores UNDER_MAINTENANCE asset to ACTIVE when condition is serviceable', () => {
      const asset = createAsset(AssetStatus.UNDER_MAINTENANCE, AssetCondition.FAIR);

      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Hydraulic seal rebuild complete',
          cost: Money.create(320),
          performedBy: 'Precision Hydraulics Ltd',
          updateConditionTo: AssetCondition.EXCELLENT,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.condition).toBe(AssetCondition.EXCELLENT);
    });

    it('automatically restores DAMAGED asset to ACTIVE when repair brings condition to serviceable', () => {
      const asset = createAsset(AssetStatus.DAMAGED, AssetCondition.NEEDS_REPAIR);

      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Replaced fractured handpiece bracket and re-tested safety circuits',
          cost: Money.create(450),
          performedBy: 'Factory Service Partner',
          updateConditionTo: AssetCondition.GOOD,
        },
        actorId,
      );

      expect(asset.status).toBe(AssetStatus.ACTIVE);
      expect(asset.condition).toBe(AssetCondition.GOOD);
    });

    it('prohibits recording maintenance on RETIRED assets', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.retire(actorId, 'Decommissioned end of life');

      expect(() => {
        asset.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Attempt repair',
            cost: Money.create(100),
            performedBy: 'Tech',
          },
          actorId,
        );
      }).toThrow(InvalidAssetStateException);
    });

    it('prohibits recording maintenance on SOLD assets', () => {
      const asset = createAsset(AssetStatus.ACTIVE);
      asset.sell(Money.create(3000), actorId, 'Liquidated to buyer');

      expect(() => {
        asset.recordMaintenance(
          {
            serviceDate: new Date(),
            description: 'Attempt repair',
            cost: Money.create(100),
            performedBy: 'Tech',
          },
          actorId,
        );
      }).toThrow(InvalidAssetStateException);
    });
  });

  describe('3. History & Domain Event Atomicity', () => {
    it('appends a MAINTENANCE_RECORDED history event atomically with maintenance record insertion', () => {
      const asset = createAsset();
      const initialHistoryLength = asset.historyEvents.length;

      const record = asset.recordMaintenance(
        {
          serviceDate: new Date('2026-04-01T09:00:00.000Z'),
          description: 'Quarterly sensor calibration and safety validation',
          cost: Money.create(250),
          performedBy: 'BioTech Calibrations Inc.',
        },
        actorId,
      );

      expect(asset.historyEvents).toHaveLength(initialHistoryLength + 1);
      const historyEntry = asset.historyEvents.at(-1)!;

      expect(historyEntry.eventType).toBe(AssetHistoryEventType.MAINTENANCE_RECORDED);
      expect(historyEntry.recordedByUserId).toBe(actorId);
      expect(historyEntry.details).toEqual({
        maintenanceRecordId: record.id.value,
        cost: expect.objectContaining({ amount: 250, currency: 'USD' }),
        performedBy: 'BioTech Calibrations Inc.',
        serviceDate: '2026-04-01T09:00:00.000Z',
      });
    });

    it('emits an AssetMaintenanceRecordedDomainEvent', () => {
      const asset = createAsset();
      asset.recordMaintenance(
        {
          serviceDate: new Date(),
          description: 'Routine check',
          cost: Money.create(50),
          performedBy: 'In-house tech',
        },
        actorId,
      );

      const events = asset.getUncommittedEvents();
      const maintenanceEvent = events.find((e) => e.eventType === 'AssetMaintenanceRecorded');
      expect(maintenanceEvent).toBeDefined();
    });
  });
});

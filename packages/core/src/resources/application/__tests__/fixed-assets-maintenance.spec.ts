import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { RecordAssetMaintenanceCommand } from '../commands/record-asset-maintenance.command';
import { RecordAssetMaintenanceHandler } from '../handlers/record-asset-maintenance.handler';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { OptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  public store = new Map<string, { asset: FixedAsset; version: number }>();
  public shouldFailSave = false;

  async findById(id: AssetId): Promise<FixedAsset | null> {
    const entry = this.store.get(id.value);
    return entry ? this.clone(entry.asset) : null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const norm = assetTag.trim().toUpperCase();
    for (const entry of this.store.values()) {
      if (entry.asset.assetTag === norm && (!tenantId || entry.asset.tenantId === tenantId)) {
        return this.clone(entry.asset);
      }
    }
    return null;
  }

  async save(asset: FixedAsset): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database connection failed during maintenance recording transaction.');
    }

    const id = asset.id.value;
    const existing = this.store.get(id);

    if (!existing) {
      this.store.set(id, { asset: this.clone(asset), version: asset.version });
      return;
    }

    const priorVersion = asset.version - 1;
    if (existing.version !== priorVersion) {
      throw new OptimisticLockException('FixedAsset', id, priorVersion);
    }

    this.store.set(id, { asset: this.clone(asset), version: asset.version });
  }

  async findAll(): Promise<FixedAsset[]> {
    return Array.from(this.store.values()).map((e) => this.clone(e.asset));
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async delete(id: AssetId): Promise<void> {
    this.store.delete(id.value);
  }

  private clone(asset: FixedAsset): FixedAsset {
    return FixedAsset.reconstitute({
      id: asset.id,
      tenantId: asset.tenantId,
      assetTag: asset.assetTag,
      name: asset.name,
      description: asset.description,
      category: asset.category,
      purchaseDate: asset.purchaseDate,
      purchaseValue: asset.purchaseValue,
      currentEstimatedValue: asset.currentEstimatedValue,
      condition: asset.condition,
      status: asset.status,
      location: asset.location,
      notes: asset.notes,
      historyEvents: [...asset.historyEvents],
      maintenanceRecords: [...asset.maintenanceRecords],
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }
}

describe('Fixed Asset Maintenance Operations (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_service_lead_01';
  let activeAsset: FixedAsset;

  beforeEach(async () => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();

    activeAsset = FixedAsset.create(
      {
        tenantId,
        assetTag: 'AST-HYPERBARIC-01',
        name: 'Hard-Shell Hyperbaric Oxygen Therapy Chamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-01'),
        purchaseValue: Money.create(95000, 'USD'),
        currentEstimatedValue: Money.create(95000, 'USD'),
        condition: AssetCondition.GOOD,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({ facilityId: 'fac_recovery_spa' }),
      },
      actorId,
    );

    await repository.save(activeAsset);
  });

  describe('1. Valid Maintenance Recording & Status Interplay', () => {
    it('records routine scheduled servicing on an ACTIVE asset without mutating status', async () => {
      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date('2026-06-15'),
        description: 'Quarterly pressure vessel seal and O-ring replacement',
        cost: { amount: 1250.75, currency: 'USD' },
        performedBy: 'OxyHealth Certified Technicians Inc.',
        notes: 'Passed all pressure leak tests at 2.0 ATA',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isSuccess).toBe(true);
      expect(res.value.description).toBe('Quarterly pressure vessel seal and O-ring replacement');
      expect(res.value.costAmount).toBe(1250.75);
      expect(res.value.costCurrency).toBe('USD');
      expect(res.value.performedBy).toBe('OxyHealth Certified Technicians Inc.');
      expect(res.value.recordedByUserId).toBe(actorId);

      // Verify aggregate state and history
      const stored = await repository.findById(activeAsset.id);
      expect(stored?.status).toBe(AssetStatus.ACTIVE);
      expect(stored?.maintenanceRecords.length).toBe(1);
      expect(stored?.historyEvents.length).toBe(2); // CREATED + MAINTENANCE_RECORDED

      const latestHistory = stored?.historyEvents[1];
      expect(latestHistory?.eventType).toBe(AssetHistoryEventType.MAINTENANCE_RECORDED);
      expect(latestHistory?.details).toEqual({
        maintenanceRecordId: res.value.id,
        cost: { amount: 1250.75, currency: 'USD' },
        performedBy: 'OxyHealth Certified Technicians Inc.',
        serviceDate: new Date('2026-06-15').toISOString(),
      });

      expect(publisher.publishedEvents.length).toBe(1);
      expect(publisher.publishedEvents[0]?.eventType).toBe('AssetMaintenanceRecorded');
    });

    it('automatically restores UNDER_MAINTENANCE asset to ACTIVE when repair completes with serviceable condition', async () => {
      activeAsset.sendToMaintenance(actorId, 'Scheduled repair overhaul');
      await repository.save(activeAsset);

      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date('2026-07-01'),
        description: 'Completed compressor overhaul and recertification',
        cost: { amount: 3500.0, currency: 'USD' },
        performedBy: 'Apex Medical Engineering',
        updateConditionTo: AssetCondition.EXCELLENT,
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isSuccess).toBe(true);

      const stored = await repository.findById(activeAsset.id);
      expect(stored?.status).toBe(AssetStatus.ACTIVE); // Restored automatically
      expect(stored?.condition).toBe(AssetCondition.EXCELLENT);
    });

    it('allows $0.00 cost for warranty or in-house preventative checkups', async () => {
      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date('2026-08-01'),
        description: 'Complimentary manufacturer warranty calibration',
        cost: { amount: 0.0, currency: 'USD' },
        performedBy: 'OEM Field Tech',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isSuccess).toBe(true);
      expect(res.value.costAmount).toBe(0.0);
    });
  });

  describe('2. Lifecycle Restrictions', () => {
    it('prohibits recording maintenance on permanently SOLD assets (Invariant [AST-INV-1])', async () => {
      activeAsset.sell(Money.create(30000, 'USD'), actorId, 'Liquidated salvage sale');
      await repository.save(activeAsset);

      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date(),
        description: 'Attempted servicing after sale',
        cost: { amount: 500, currency: 'USD' },
        performedBy: 'Technician',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("terminal state 'SOLD'");
    });

    it('prohibits recording maintenance on decommissioned RETIRED assets (Invariant [AST-INV-1])', async () => {
      activeAsset.retire(actorId, 'Decommissioned due to age');
      await repository.save(activeAsset);

      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date(),
        description: 'Attempted servicing retired equipment',
        cost: { amount: 500, currency: 'USD' },
        performedBy: 'Technician',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("state 'RETIRED'");
    });
  });

  describe('3. Validation & Transaction Safety', () => {
    it('rejects negative maintenance cost', async () => {
      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date(),
        description: 'Valid repair description',
        cost: { amount: -50.0, currency: 'USD' },
        performedBy: 'Tech Guy',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('must be a non-negative number');
    });

    it('rejects missing actor ID or missing performedBy', async () => {
      const handler = new RecordAssetMaintenanceHandler(repository, publisher);

      const res1 = await handler.execute(
        new RecordAssetMaintenanceCommand({
          assetId: activeAsset.id.value,
          tenantId,
          serviceDate: new Date(),
          description: 'Valid repair description',
          cost: { amount: 100, currency: 'USD' },
          performedBy: 'Tech Guy',
          actorId: '',
        }),
      );
      expect(res1.isFailure).toBe(true);
      expect(res1.error).toContain('Authenticated actor ID is required');

      const res2 = await handler.execute(
        new RecordAssetMaintenanceCommand({
          assetId: activeAsset.id.value,
          tenantId,
          serviceDate: new Date(),
          description: 'Valid repair description',
          cost: { amount: 100, currency: 'USD' },
          performedBy: '',
          actorId,
        }),
      );
      expect(res2.isFailure).toBe(true);
      expect(res2.error).toContain('PerformedBy technician or service provider is required');
    });

    it('guarantees atomicity and rolls back on database transaction failure', async () => {
      repository.shouldFailSave = true;

      const handler = new RecordAssetMaintenanceHandler(repository, publisher);
      const command = new RecordAssetMaintenanceCommand({
        assetId: activeAsset.id.value,
        tenantId,
        serviceDate: new Date(),
        description: 'Routine maintenance',
        cost: { amount: 500, currency: 'USD' },
        performedBy: 'Tech Guy',
        actorId,
      });

      const res = await handler.execute(command);

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Database connection failed');

      // Verify aggregate has not persisted any maintenance records
      repository.shouldFailSave = false;
      const stored = await repository.findById(activeAsset.id);
      expect(stored?.maintenanceRecords.length).toBe(0);
      expect(stored?.version).toBe(1);
      expect(publisher.publishedEvents.length).toBe(0);
    });
  });
});

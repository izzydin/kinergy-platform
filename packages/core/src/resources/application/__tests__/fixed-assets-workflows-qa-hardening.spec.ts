import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { OptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';

// Application Handlers & Commands / Queries
import { CreateFixedAssetCommand } from '../commands/create-fixed-asset.command';
import { CreateFixedAssetHandler } from '../handlers/create-fixed-asset.handler';
import { UpdateFixedAssetDetailsCommand } from '../commands/update-fixed-asset-details.command';
import { UpdateFixedAssetDetailsHandler } from '../handlers/update-fixed-asset-details.handler';
import { TransferFixedAssetLocationCommand } from '../commands/transfer-fixed-asset-location.command';
import { TransferFixedAssetLocationHandler } from '../handlers/transfer-fixed-asset-location.handler';
import { ChangeFixedAssetStatusCommand } from '../commands/change-fixed-asset-status.command';
import { ChangeFixedAssetStatusHandler } from '../handlers/change-fixed-asset-status.handler';
import { UpdateFixedAssetValuationCommand } from '../commands/update-fixed-asset-valuation.command';
import { UpdateFixedAssetValuationHandler } from '../handlers/update-fixed-asset-valuation.handler';
import { RecordAssetMaintenanceCommand } from '../commands/record-asset-maintenance.command';
import { RecordAssetMaintenanceHandler } from '../handlers/record-asset-maintenance.handler';
import { GetAssetHistoryQuery } from '../queries/get-asset-history.query';
import { GetAssetHistoryHandler } from '../handlers/get-asset-history.handler';

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
      throw new Error('Database transaction abort simulated.');
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

describe('Fixed Asset Application Layer QA Hardening & Invariant Security (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;

  const tenantId = 'tenant_kinergy_flagship';
  const facilityManager = 'usr_facility_mgr_01';
  const technician = 'usr_lead_tech_01';
  const financeDirector = 'usr_cfo_01';

  beforeEach(() => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();
  });

  describe('1. End-to-End Realistic Business Lifecycle Orchestration', () => {
    it('executes complete asset lifecycle from acquisition through servicing, revaluation, and disposal', async () => {
      // 1. COMMISSIONING: Register brand new medical cryo chamber
      const createHandler = new CreateFixedAssetHandler(repository, publisher);
      const createRes = await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'CRYO-CHAMBER-2026-X1',
          name: 'ArcticPro Whole Body Cryotherapy Chamber',
          description: 'Electric dual-room sub-zero chamber',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-15'),
          purchaseValue: { amount: 65000.0, currency: 'USD' },
          currentEstimatedValue: { amount: 65000.0, currency: 'USD' },
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: { facilityId: 'fac_main', roomId: 'rm_spa_01', zone: 'East Wing' },
          notes: 'Delivered with 3-year factory warranty',
          actorId: facilityManager,
        }),
      );

      expect(createRes.isSuccess).toBe(true);
      const assetId = createRes.value.id;
      expect(createRes.value.status).toBe(AssetStatus.ACTIVE);
      expect(createRes.value.condition).toBe(AssetCondition.EXCELLENT);
      expect(createRes.value.historyEventsCount).toBe(1);

      // 2. LOCATION RELOCATION: Move equipment to dedicated cryogenic suite
      const transferHandler = new TransferFixedAssetLocationHandler(repository, publisher);
      const transferRes = await transferHandler.execute(
        new TransferFixedAssetLocationCommand({
          id: assetId,
          tenantId,
          location: { facilityId: 'fac_main', roomId: 'rm_cryo_suite', zone: 'Recovery Wing' },
          reason: 'Transferred to newly constructed cryogenic isolation suite',
          actorId: facilityManager,
        }),
      );

      expect(transferRes.isSuccess).toBe(true);
      expect(transferRes.value.location.roomId).toBe('rm_cryo_suite');
      expect(transferRes.value.historyEventsCount).toBe(2);

      // 3. DEFECT REPORT: Cooling compressor fan failure
      const statusHandler = new ChangeFixedAssetStatusHandler(repository, publisher);
      const damageRes = await statusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          id: assetId,
          tenantId,
          status: AssetStatus.DAMAGED,
          reason: 'Compressor thermal overload sensor triggered emergency shutdown',
          actorId: technician,
        }),
      );

      expect(damageRes.isSuccess).toBe(true);
      expect(damageRes.value.status).toBe(AssetStatus.DAMAGED);
      expect(damageRes.value.historyEventsCount).toBe(3);

      // 4. WORKSHOP DISPATCH: Transition to UNDER_MAINTENANCE
      const maintenanceStatusRes = await statusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          id: assetId,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Dispatched to OEM refrigeration specialists for diagnostics and repair',
          actorId: facilityManager,
        }),
      );

      expect(maintenanceStatusRes.isSuccess).toBe(true);
      expect(maintenanceStatusRes.value.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(maintenanceStatusRes.value.historyEventsCount).toBe(4);

      // 5. SERVICING COMPLETION: Record maintenance and auto-restore to ACTIVE
      const maintenanceHandler = new RecordAssetMaintenanceHandler(repository, publisher);
      const recordMaintRes = await maintenanceHandler.execute(
        new RecordAssetMaintenanceCommand({
          assetId,
          tenantId,
          serviceDate: new Date('2026-03-20'),
          description: 'Replaced primary cooling stage hermetic compressor and refrigerant charge',
          cost: { amount: 3450.0, currency: 'USD' },
          performedBy: 'ArcticPro OEM Certified Service Team',
          updateConditionTo: AssetCondition.EXCELLENT,
          notes: 'System pressure tested down to -140C and recalibrated',
          actorId: technician,
        }),
      );

      expect(recordMaintRes.isSuccess).toBe(true);
      expect(recordMaintRes.value.costAmount).toBe(3450.0);

      // Verify aggregate status was restored to ACTIVE automatically upon serviceable condition
      const reloadedAsset = await repository.findById(AssetId.create(assetId));
      expect(reloadedAsset?.status).toBe(AssetStatus.ACTIVE);
      expect(reloadedAsset?.condition).toBe(AssetCondition.EXCELLENT);
      expect(reloadedAsset?.maintenanceRecords.length).toBe(1);
      expect(reloadedAsset?.historyEvents.length).toBe(5);

      // 6. ANNUAL DEPRECIATION / REVALUATION: Update current estimated book value
      const valuationHandler = new UpdateFixedAssetValuationHandler(repository, publisher);
      const valRes = await valuationHandler.execute(
        new UpdateFixedAssetValuationCommand({
          id: assetId,
          tenantId,
          estimatedValue: { amount: 55250.0, currency: 'USD' },
          reason: 'Annual straight-line depreciation adjustment for FY2026',
          actorId: financeDirector,
        }),
      );

      expect(valRes.isSuccess).toBe(true);
      expect(valRes.value.currentEstimatedValueAmount).toBe(55250.0);
      expect(valRes.value.purchaseValueAmount).toBe(65000.0); // Purchase value permanently preserved

      // 7. COMPREHENSIVE AUDIT TRAIL VERIFICATION via GetAssetHistory
      const historyHandler = new GetAssetHistoryHandler(repository);
      const historyRes = await historyHandler.execute(
        new GetAssetHistoryQuery({
          assetId,
          tenantId,
          page: 1,
          pageSize: 20,
          sortOrder: 'desc',
        }),
      );

      expect(historyRes.isSuccess).toBe(true);
      expect(historyRes.value.total).toBe(6);
      expect(historyRes.value.items.map((i) => i.eventType)).toEqual([
        AssetHistoryEventType.VALUE_UPDATED,
        AssetHistoryEventType.MAINTENANCE_RECORDED,
        AssetHistoryEventType.STATUS_CHANGED,
        AssetHistoryEventType.STATUS_CHANGED,
        AssetHistoryEventType.TRANSFERRED,
        AssetHistoryEventType.CREATED,
      ]);
    });
  });

  describe('2. Invariant Bypass & Security Protections', () => {
    it('generic UpdateAssetDetails cannot bypass dedicated workflows', async () => {
      const asset = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-REFORMER-99',
          name: 'Original Name',
          description: 'Original Desc',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: Money.create(5000, 'USD'),
          currentEstimatedValue: Money.create(5000, 'USD'),
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_main', roomId: 'rm_pilates' }),
        },
        facilityManager,
      );
      await repository.save(asset);

      const updateHandler = new UpdateFixedAssetDetailsHandler(repository, publisher);
      const res = await updateHandler.execute(
        new UpdateFixedAssetDetailsCommand({
          id: asset.id.value,
          tenantId,
          name: 'Updated Name Only',
          description: 'Updated Description Only',
          notes: 'Updated Notes Only',
          actorId: facilityManager,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.name).toBe('Updated Name Only');
      expect(res.value.status).toBe(AssetStatus.ACTIVE);
      expect(res.value.condition).toBe(AssetCondition.GOOD);
      expect(res.value.location.roomId).toBe('rm_pilates'); // Location unbypassed
      expect(res.value.currentEstimatedValueAmount).toBe(5000); // Value unbypassed
    });

    it('prohibits any operation on SOLD assets (Terminal Sink Lock [AST-INV-1])', async () => {
      const asset = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-LIQUIDATED-01',
          name: 'Sold Machine',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2025-01-01'),
          purchaseValue: Money.create(10000, 'USD'),
          currentEstimatedValue: Money.create(10000, 'USD'),
          condition: AssetCondition.FAIR,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_main' }),
        },
        facilityManager,
      );
      asset.sell(Money.create(2500, 'USD'), facilityManager, 'Salvage liquidation');
      await repository.save(asset);

      // Attempt 1: Location Transfer
      const transferHandler = new TransferFixedAssetLocationHandler(repository);
      const transRes = await transferHandler.execute(
        new TransferFixedAssetLocationCommand({
          id: asset.id.value,
          tenantId,
          location: { facilityId: 'fac_new' },
          actorId: facilityManager,
        }),
      );
      expect(transRes.isFailure).toBe(true);
      expect(transRes.error).toContain("terminal state 'SOLD'");

      // Attempt 2: Status Transition
      const statusHandler = new ChangeFixedAssetStatusHandler(repository);
      const statRes = await statusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Reactivate sold asset',
          actorId: facilityManager,
        }),
      );
      expect(statRes.isFailure).toBe(true);
      expect(statRes.error).toContain("terminal state 'SOLD'");

      // Attempt 3: Maintenance
      const maintHandler = new RecordAssetMaintenanceHandler(repository);
      const maintRes = await maintHandler.execute(
        new RecordAssetMaintenanceCommand({
          assetId: asset.id.value,
          tenantId,
          serviceDate: new Date(),
          description: 'Service sold asset',
          cost: { amount: 100 },
          performedBy: 'Tech',
          actorId: technician,
        }),
      );
      expect(maintRes.isFailure).toBe(true);
      expect(maintRes.error).toContain("terminal state 'SOLD'");
    });
  });

  describe('3. Concurrency & Optimistic Locking', () => {
    it('detects OCC mismatch when concurrent operations conflict', async () => {
      const asset = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-CONCURRENT-01',
          name: 'Ultrasound Scanner',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: Money.create(15000, 'USD'),
          currentEstimatedValue: Money.create(15000, 'USD'),
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_main' }),
        },
        facilityManager,
      );
      await repository.save(asset);

      // Load two parallel copies of the aggregate
      const copyA = await repository.findById(asset.id);
      const copyB = await repository.findById(asset.id);
      expect(copyA?.version).toBe(1);
      expect(copyB?.version).toBe(1);

      // Mutate and save copy A
      copyA?.transferLocation(
        AssetLocation.create({ facilityId: 'fac_main', roomId: 'rm_202' }),
        facilityManager,
      );
      await repository.save(copyA!);

      // Mutate and attempt to save copy B (stale version 1)
      copyB?.updateCondition(AssetCondition.GOOD, technician, 'Minor wear observed');
      await expect(repository.save(copyB!)).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('4. Transaction Atomicity & Error Safety', () => {
    it('guarantees complete rollback with zero orphaned events or records on persistence error', async () => {
      const asset = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-ROLLBACK-01',
          name: 'Shockwave Unit',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: Money.create(12000, 'USD'),
          currentEstimatedValue: Money.create(12000, 'USD'),
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_main' }),
        },
        facilityManager,
      );
      await repository.save(asset);

      repository.shouldFailSave = true;

      const transferHandler = new TransferFixedAssetLocationHandler(repository, publisher);
      const res = await transferHandler.execute(
        new TransferFixedAssetLocationCommand({
          id: asset.id.value,
          tenantId,
          location: { facilityId: 'fac_remote' },
          reason: 'Failed transfer attempt',
          actorId: facilityManager,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Database transaction abort simulated');

      // Verify aggregate state in repository remains version 1 and location untouched
      repository.shouldFailSave = false;
      const stored = await repository.findById(asset.id);
      expect(stored?.version).toBe(1);
      expect(stored?.location.facilityId).toBe('fac_main');
      expect(stored?.historyEvents.length).toBe(1); // Only initial CREATED
      expect(publisher.publishedEvents.length).toBe(0);
    });
  });
});

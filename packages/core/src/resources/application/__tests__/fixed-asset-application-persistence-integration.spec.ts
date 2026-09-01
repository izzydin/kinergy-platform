import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import {
  FixedAssetRepositoryInterface,
  FixedAssetFilterOptions,
} from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';

// Command Handlers
import { CreateFixedAssetHandler } from '../handlers/create-fixed-asset.handler';
import { TransferFixedAssetLocationHandler } from '../handlers/transfer-fixed-asset-location.handler';
import { ChangeFixedAssetStatusHandler } from '../handlers/change-fixed-asset-status.handler';
import { UpdateFixedAssetConditionHandler } from '../handlers/update-fixed-asset-condition.handler';
import { RecordAssetMaintenanceHandler } from '../handlers/record-asset-maintenance.handler';
import { UpdateFixedAssetValuationHandler } from '../handlers/update-fixed-asset-valuation.handler';

// Query Handlers
import { GetFixedAssetByIdHandler } from '../handlers/get-fixed-asset-by-id.handler';
import { GetFixedAssetByTagHandler } from '../handlers/get-fixed-asset-by-tag.handler';
import { GetAssetHistoryHandler } from '../handlers/get-asset-history.handler';
import { GetMaintenanceHistoryHandler } from '../handlers/get-maintenance-history.handler';
import { GetFixedAssetValuationSummaryHandler } from '../handlers/get-fixed-asset-valuation-summary.handler';

// Commands
import { CreateFixedAssetCommand } from '../commands/create-fixed-asset.command';
import { TransferFixedAssetLocationCommand } from '../commands/transfer-fixed-asset-location.command';
import { ChangeFixedAssetStatusCommand } from '../commands/change-fixed-asset-status.command';
import { UpdateFixedAssetConditionCommand } from '../commands/update-fixed-asset-condition.command';
import { RecordAssetMaintenanceCommand } from '../commands/record-asset-maintenance.command';
import { UpdateFixedAssetValuationCommand } from '../commands/update-fixed-asset-valuation.command';

// Queries
import { GetFixedAssetByIdQuery } from '../queries/get-fixed-asset-by-id.query';
import { GetFixedAssetByTagQuery } from '../queries/get-fixed-asset-by-tag.query';
import { GetAssetHistoryQuery } from '../queries/get-asset-history.query';
import { GetMaintenanceHistoryQuery } from '../queries/get-maintenance-history.query';
import { GetFixedAssetValuationSummaryQuery } from '../queries/get-fixed-asset-valuation-summary.query';

import { OptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';

/**
 * High-fidelity, in-memory transactional repository double for FixedAsset aggregates,
 * supporting clone-on-write isolation, OCC versioning, child maintenance records, and audit history.
 */
class InMemoryTransactionalFixedAssetRepository implements FixedAssetRepositoryInterface {
  public store = new Map<string, FixedAsset>();
  public saveCallCount = 0;

  async findById(id: AssetId): Promise<FixedAsset | null> {
    const asset = this.store.get(id.value);
    return asset ? this.clone(asset) : null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const norm = assetTag.trim().toUpperCase();
    for (const asset of this.store.values()) {
      if (asset.assetTag === norm && (!tenantId || asset.tenantId === tenantId)) {
        return this.clone(asset);
      }
    }
    return null;
  }

  async save(asset: FixedAsset): Promise<void> {
    this.saveCallCount++;
    const existing = this.store.get(asset.id.value);

    // Optimistic Concurrency Control
    if (existing && existing.version >= asset.version) {
      throw new OptimisticLockException('FixedAsset', asset.id.value, existing.version);
    }

    this.store.set(asset.id.value, this.clone(asset));
  }

  async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    let list = Array.from(this.store.values()).map((a) => this.clone(a));

    if (filter?.tenantId) {
      list = list.filter((a) => a.tenantId === filter.tenantId);
    }
    if (filter?.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      list = list.filter((a) => cats.includes(a.category));
    }
    if (!filter?.includeDecommissioned) {
      list = list.filter((a) => a.status !== AssetStatus.RETIRED && a.status !== AssetStatus.SOLD);
    }
    return list;
  }

  async count(filter?: FixedAssetFilterOptions): Promise<number> {
    const list = await this.findAll(filter);
    return list.length;
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
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      historyEvents: [...asset.historyEvents],
      maintenanceRecords: [...asset.maintenanceRecords],
    });
  }
}

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Phase 6.10: Fixed Asset Application & Persistence Integration Test Suite', () => {
  const actorId = 'usr_qa_asset_lead';
  const tenantId = 'tenant_rehab_facility_01';

  let repository: InMemoryTransactionalFixedAssetRepository;
  let eventPublisher: MockEventPublisher;

  // Handlers under test
  let createAssetHandler: CreateFixedAssetHandler;
  let transferHandler: TransferFixedAssetLocationHandler;
  let changeStatusHandler: ChangeFixedAssetStatusHandler;
  let updateConditionHandler: UpdateFixedAssetConditionHandler;
  let recordMaintenanceHandler: RecordAssetMaintenanceHandler;
  let updateValuationHandler: UpdateFixedAssetValuationHandler;

  let getAssetByIdHandler: GetFixedAssetByIdHandler;
  let getAssetByTagHandler: GetFixedAssetByTagHandler;
  let getAssetHistoryHandler: GetAssetHistoryHandler;
  let getMaintenanceHistoryHandler: GetMaintenanceHistoryHandler;
  let getValuationSummaryHandler: GetFixedAssetValuationSummaryHandler;

  beforeEach(() => {
    repository = new InMemoryTransactionalFixedAssetRepository();
    eventPublisher = new MockEventPublisher();

    createAssetHandler = new CreateFixedAssetHandler(repository, eventPublisher);
    transferHandler = new TransferFixedAssetLocationHandler(repository, eventPublisher);
    changeStatusHandler = new ChangeFixedAssetStatusHandler(repository, eventPublisher);
    updateConditionHandler = new UpdateFixedAssetConditionHandler(repository, eventPublisher);
    recordMaintenanceHandler = new RecordAssetMaintenanceHandler(repository, eventPublisher);
    updateValuationHandler = new UpdateFixedAssetValuationHandler(repository, eventPublisher);

    getAssetByIdHandler = new GetFixedAssetByIdHandler(repository);
    getAssetByTagHandler = new GetFixedAssetByTagHandler(repository);
    getAssetHistoryHandler = new GetAssetHistoryHandler(repository);
    getMaintenanceHistoryHandler = new GetMaintenanceHistoryHandler(repository);
    getValuationSummaryHandler = new GetFixedAssetValuationSummaryHandler(repository);
  });

  // ============================================================================
  // 1. ASSET CREATION & PERSISTENCE INTEGRATION
  // ============================================================================
  describe('1. Fixed Asset Registration & Persistence Integration', () => {
    it('creates and persists a valid fixed asset with initial CREATED history event', async () => {
      const command = new CreateFixedAssetCommand({
        tenantId,
        assetTag: 'AST-REHAB-001',
        name: 'Hydrotherapy Ultrasound System',
        description: 'Multi-frequency ultrasound device with dual transducer',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2025-06-01T00:00:00Z'),
        purchaseValue: { amount: 4800.0, currency: 'USD' },
        currentEstimatedValue: { amount: 4500.0, currency: 'USD' },
        condition: AssetCondition.EXCELLENT,
        location: {
          facilityId: 'fac_central_rehab',
          roomId: 'room_treatment_02',
          zone: 'Zone B',
        },
        actorId,
      });

      const result = await createAssetHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBeDefined();
      expect(dto.assetTag).toBe('AST-REHAB-001');
      expect(dto.status).toBe(AssetStatus.ACTIVE);
      expect(dto.condition).toBe(AssetCondition.EXCELLENT);
      expect(dto.version).toBe(1);

      // Inspect persisted aggregate
      const persisted = await repository.findByAssetTag('AST-REHAB-001', tenantId);
      expect(persisted).not.toBeNull();
      expect(persisted!.name).toBe('Hydrotherapy Ultrasound System');
      expect(persisted?.purchaseValue.amount).toBe(4800.0);
      expect(persisted?.currentEstimatedValue.amount).toBe(4500.0);
      expect(persisted?.version).toBe(1);

      // Assert persisted audit history
      expect(persisted!.historyEvents).toHaveLength(1);
      expect(persisted!.historyEvents[0]!.eventType).toBe(AssetHistoryEventType.CREATED);
      expect(persisted!.historyEvents[0]!.recordedByUserId).toBe(actorId);

      // Verify domain events published
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]!.eventType).toBe('AssetCreated');
    });

    it('rejects duplicate assetTag registration within the same facility tenant', async () => {
      const cmd = new CreateFixedAssetCommand({
        tenantId,
        assetTag: 'AST-DUP-01',
        name: 'Original Treadmill',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2025-01-01T00:00:00Z'),
        purchaseValue: { amount: 2500.0, currency: 'USD' },
        location: { facilityId: 'fac_main' },
        actorId,
      });

      const firstRes = await createAssetHandler.execute(cmd);
      expect(firstRes.isSuccess).toBe(true);

      const secondRes = await createAssetHandler.execute(cmd);
      expect(secondRes.isSuccess).toBe(false);
      expect(secondRes.getError()).toContain('already exists');
    });
  });

  // ============================================================================
  // 2. ASSET PHYSICAL TRANSFER & AUDIT LOGGING
  // ============================================================================
  describe('2. Physical Location Transfer & Audit Trail', () => {
    it('relocates asset to new facility/room, updates location, increments version, and logs TRANSFERRED history', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-TRANSFER-01',
          name: 'Pilates Reformer Clinical Model',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 3500.0, currency: 'USD' },
          location: { facilityId: 'fac_north', roomId: 'room_101' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      const transferCmd = new TransferFixedAssetLocationCommand({
        tenantId,
        id: assetId,
        location: {
          facilityId: 'fac_south',
          roomId: 'room_studio_rehab',
          zone: 'Reformer Area',
          description: 'Relocated for outpatient group sessions',
        },
        reason: 'Departmental reallocation of physical therapy equipment',
        actorId,
      });

      const transferRes = await transferHandler.execute(transferCmd);
      expect(transferRes.isSuccess).toBe(true);

      const dto = transferRes.getValue();
      expect(dto.location.facilityId).toBe('fac_south');
      expect(dto.location.roomId).toBe('room_studio_rehab');
      expect(dto.version).toBe(2);

      // Verify persisted state & history
      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted).not.toBeNull();
      expect(persisted!.location.facilityId).toBe('fac_south');
      expect(persisted!.location.roomId).toBe('room_studio_rehab');
      expect(persisted!.version).toBe(2);

      expect(persisted!.historyEvents).toHaveLength(2); // CREATED + TRANSFERRED
      const transferEvent = persisted!.historyEvents[1]!;
      expect(transferEvent.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
      expect(transferEvent.recordedByUserId).toBe(actorId);
      expect(transferEvent.description).toContain('Departmental reallocation');
    });
  });

  // ============================================================================
  // 3. TRANSFER RESTRICTIONS & ROLLBACK ISOLATION ([AST-INV-1], [AST-INV-2])
  // ============================================================================
  describe('3. Transfer Failure & Rollback Invariance', () => {
    it('blocks location transfer on RETIRED assets and leaves persisted location untouched', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-RETIRED-TRF',
          name: 'Decommissioned Laser',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2023-01-01T00:00:00Z'),
          purchaseValue: { amount: 8000.0, currency: 'USD' },
          location: { facilityId: 'fac_storage_depot', roomId: 'storage_bay_4' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // Retire asset
      await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.RETIRED,
          reason: 'Beyond economical repair write-off',
          actorId,
        }),
      );

      // Attempt transfer on RETIRED asset
      const failedTransfer = await transferHandler.execute(
        new TransferFixedAssetLocationCommand({
          tenantId,
          id: assetId,
          location: { facilityId: 'fac_active_clinic', roomId: 'room_1' },
          reason: 'Attempted relocation of scrapped asset',
          actorId,
        }),
      );

      expect(failedTransfer.isSuccess).toBe(false);
      expect(failedTransfer.getError()).toContain('Cannot transfer decommissioned fixed asset');

      // Verify zero state corruption
      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.status).toBe(AssetStatus.RETIRED);
      expect(persisted?.location.facilityId).toBe('fac_storage_depot');
      expect(persisted?.version).toBe(2); // 1 (create) + 1 (retire)
      expect(persisted?.historyEvents).toHaveLength(2); // CREATED + STATUS_CHANGED (no phantom TRANSFERRED!)
    });
  });

  // ============================================================================
  // 4. MAINTENANCE SERVICING & HISTORY RETRIEVAL ([AST-INV-6])
  // ============================================================================
  describe('4. Maintenance Servicing & Child Record Persistence', () => {
    it('records maintenance, persists maintenance record, auto-restores to ACTIVE, and logs audit event', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-MAINT-01',
          name: 'Cable Crossover Machine',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-01-01T00:00:00Z'),
          purchaseValue: { amount: 3200.0, currency: 'USD' },
          location: { facilityId: 'fac_main_gym', roomId: 'weight_room' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // Put under maintenance
      await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Worn pulley cable scheduled replacement',
          actorId,
        }),
      );

      // Record maintenance servicing
      const maintCmd = new RecordAssetMaintenanceCommand({
        tenantId,
        assetId,
        serviceDate: new Date('2026-08-30T10:00:00Z'),
        description: 'Replaced bilateral high-tensile steel cables and lubricated pulley bearings',
        performedBy: 'Fitness Equipment Solutions LLC (Tech: Mark R.)',
        cost: { amount: 285.5, currency: 'USD' },
        updateConditionTo: AssetCondition.GOOD,
        actorId,
      });

      const maintRes = await recordMaintenanceHandler.execute(maintCmd);
      expect(maintRes.isSuccess).toBe(true);

      const maintDto = maintRes.getValue();
      expect(maintDto.id).toBeDefined();
      expect(maintDto.costAmount).toBe(285.5);
      expect(maintDto.performedBy).toContain('Fitness Equipment Solutions');

      // Verify persisted state: auto-restores to ACTIVE because condition is GOOD
      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe(AssetStatus.ACTIVE);
      expect(persisted!.condition).toBe(AssetCondition.GOOD);
      expect(persisted!.maintenanceRecords).toHaveLength(1);
      expect(persisted!.maintenanceRecords[0]!.cost.amount).toBe(285.5);

      // Verify Maintenance History Query
      const maintHistoryRes = await getMaintenanceHistoryHandler.execute(
        new GetMaintenanceHistoryQuery({ assetId, tenantId }),
      );
      expect(maintHistoryRes.isSuccess).toBe(true);
      expect(maintHistoryRes.getValue().items).toHaveLength(1);
      expect(maintHistoryRes.getValue().items[0]!.description).toContain('Replaced bilateral');
    });
  });

  // ============================================================================
  // 5. STATUS TRANSITION STATE MACHINE & FORBIDDEN RESURRECTION ([AST-INV-1])
  // ============================================================================
  describe('5. Status Transition Lifecycle & Terminal Invariants', () => {
    it('executes valid multi-step transition: ACTIVE -> DAMAGED -> UNDER_MAINTENANCE -> ACTIVE', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-STATE-FLOW',
          name: 'Electrotherapy Stimulation Unit',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 2000.0, currency: 'USD' },
          location: { facilityId: 'fac_clinic' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // 1. ACTIVE -> DAMAGED
      const step1 = await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.DAMAGED,
          reason: 'Dropped by staff during room transfer',
          actorId,
        }),
      );
      expect(step1.isSuccess).toBe(true);

      // 2. DAMAGED -> UNDER_MAINTENANCE
      const step2 = await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Sent to manufacturer service depot for recalibration',
          actorId,
        }),
      );
      expect(step2.isSuccess).toBe(true);

      // 3. UNDER_MAINTENANCE -> ACTIVE
      const step3 = await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.ACTIVE,
          reason: 'Received back calibrated and certified for clinical use',
          actorId,
        }),
      );
      expect(step3.isSuccess).toBe(true);

      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.status).toBe(AssetStatus.ACTIVE);
      expect(persisted?.version).toBe(4); // 1 + 3 transitions
      expect(persisted?.historyEvents).toHaveLength(4);
    });

    it('prohibits illegal transition from RETIRED back to ACTIVE ([AST-INV-1])', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-NO-RESURRECT',
          name: 'Old Ice Machine',
          category: AssetCategory.KITCHEN_EQUIPMENT,
          purchaseDate: new Date('2022-01-01T00:00:00Z'),
          purchaseValue: { amount: 1500.0, currency: 'USD' },
          location: { facilityId: 'fac_clinic' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // Retire
      await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.RETIRED,
          reason: 'Scrapped due to refrigerant leak',
          actorId,
        }),
      );

      // Attempt resurrection to ACTIVE
      const failedResurrect = await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: assetId,
          status: AssetStatus.ACTIVE,
          reason: 'Attempted un-retire',
          actorId,
        }),
      );

      expect(failedResurrect.isSuccess).toBe(false);
      expect(failedResurrect.getError()).toContain('Invalid status transition');

      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.status).toBe(AssetStatus.RETIRED);
      expect(persisted?.version).toBe(2);
    });
  });

  // ============================================================================
  // 6. PHYSICAL CONDITION RATINGS & PERSISTENCE
  // ============================================================================
  describe('6. Physical Condition Rating Updates', () => {
    it('updates physical condition, persists rating, and logs CONDITION_CHANGED history', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-COND-01',
          name: 'Incline Dumbbell Bench',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-01-01T00:00:00Z'),
          purchaseValue: { amount: 600.0, currency: 'USD' },
          location: { facilityId: 'fac_gym' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      const updateCondRes = await updateConditionHandler.execute(
        new UpdateFixedAssetConditionCommand({
          tenantId,
          id: assetId,
          condition: AssetCondition.NEEDS_REPAIR,
          reason: 'Vinyl upholstery torn near headrest; foam exposed',
          actorId,
        }),
      );

      expect(updateCondRes.isSuccess).toBe(true);
      expect(updateCondRes.getValue().condition).toBe(AssetCondition.NEEDS_REPAIR);

      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.condition).toBe(AssetCondition.NEEDS_REPAIR);
      expect(persisted?.historyEvents).toHaveLength(2); // CREATED + CONDITION_CHANGED
      expect(persisted?.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
    });
  });

  // ============================================================================
  // 7. ASSET REVALUATION & NEGATIVE MONEY PREVENTION ([AST-INV-7])
  // ============================================================================
  describe('7. Asset Valuation Updates & Monetary Validation', () => {
    it('revalues asset carrying value, persists new amount, and logs VALUE_UPDATED event', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-REVAL-01',
          name: 'Commercial Elliptical Trainer',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-01-01T00:00:00Z'),
          purchaseValue: { amount: 4500.0, currency: 'USD' },
          currentEstimatedValue: { amount: 4000.0, currency: 'USD' },
          location: { facilityId: 'fac_gym' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      const revalRes = await updateValuationHandler.execute(
        new UpdateFixedAssetValuationCommand({
          tenantId,
          id: assetId,
          estimatedValue: { amount: 3200.0, currency: 'USD' },
          reason: 'Annual straight-line depreciation adjustment',
          actorId,
        }),
      );

      expect(revalRes.isSuccess).toBe(true);
      expect(revalRes.getValue().currentEstimatedValueAmount).toBe(3200.0);

      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.currentEstimatedValue.amount).toBe(3200.0);
      expect(persisted?.historyEvents).toHaveLength(2); // CREATED + VALUE_UPDATED
      expect(persisted?.historyEvents[1]!.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);
    });

    it('rejects negative valuation and leaves persisted book value unchanged', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-NEG-VAL',
          name: 'Stretching Mat Station',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2024-01-01T00:00:00Z'),
          purchaseValue: { amount: 300.0, currency: 'USD' },
          currentEstimatedValue: { amount: 250.0, currency: 'USD' },
          location: { facilityId: 'fac_gym' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      const failedReval = await updateValuationHandler.execute(
        new UpdateFixedAssetValuationCommand({
          tenantId,
          id: assetId,
          estimatedValue: { amount: -50.0, currency: 'USD' },
          actorId,
        }),
      );

      expect(failedReval.isSuccess).toBe(false);
      expect(failedReval.getError()).toContain('must be a non-negative number');

      const persisted = await repository.findById(AssetId.create(assetId));
      expect(persisted?.currentEstimatedValue.amount).toBe(250.0);
      expect(persisted?.version).toBe(1);
    });
  });

  // ============================================================================
  // 8. AUDIT LEDGER COMPREHENSIVE QUERY INTEGRATION
  // ============================================================================
  describe('8. Audit Ledger Querying & Chronological Integrity', () => {
    it('retrieves complete chronological history across creation, transfer, condition, and revaluation', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-AUDIT-ALL',
          name: 'Physical Therapy Treatment Table',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 1800.0, currency: 'USD' },
          location: { facilityId: 'fac_north', roomId: 'room_1' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // 1. Transfer
      await transferHandler.execute(
        new TransferFixedAssetLocationCommand({
          tenantId,
          id: assetId,
          location: { facilityId: 'fac_north', roomId: 'room_2' },
          reason: 'Moved to Room 2',
          actorId,
        }),
      );

      // 2. Update Condition
      await updateConditionHandler.execute(
        new UpdateFixedAssetConditionCommand({
          tenantId,
          id: assetId,
          condition: AssetCondition.GOOD,
          reason: 'Minor scuff marks',
          actorId,
        }),
      );

      // 3. Revalue
      await updateValuationHandler.execute(
        new UpdateFixedAssetValuationCommand({
          tenantId,
          id: assetId,
          estimatedValue: { amount: 1600.0, currency: 'USD' },
          reason: 'Appraisal updated',
          actorId,
        }),
      );

      // Query complete history in ascending order
      const historyRes = await getAssetHistoryHandler.execute(
        new GetAssetHistoryQuery({ assetId, tenantId, sortOrder: 'asc' }),
      );

      expect(historyRes.isSuccess).toBe(true);
      const historyEvents = historyRes.getValue().items;
      expect(historyEvents).toHaveLength(4);

      const types = historyEvents.map((e) => e.eventType);
      expect(types).toEqual([
        AssetHistoryEventType.CREATED,
        AssetHistoryEventType.TRANSFERRED,
        AssetHistoryEventType.CONDITION_CHANGED,
        AssetHistoryEventType.VALUE_UPDATED,
      ]);
    });
  });

  // ============================================================================
  // 9. VALUATION SUMMARY QUERY INTEGRATION (ADR-0097)
  // ============================================================================
  describe('9. Valuation Summary Lifecycle Inclusion Integration', () => {
    it('accurately derives totalCarryingValue (Active + Maintenance + Damaged) and totalPurchaseValue', async () => {
      // 1. Active: purchase $5,000, carrying $4,000
      await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-V-1',
          name: 'Cardio Bike',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 5000.0, currency: 'USD' },
          currentEstimatedValue: { amount: 4000.0, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );

      // 2. Under Maintenance: purchase $3,000, carrying $2,500
      const maintAssetRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-V-2',
          name: 'Traction Table',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 3000.0, currency: 'USD' },
          currentEstimatedValue: { amount: 2500.0, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );
      await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: maintAssetRes.getValue().id,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Routine cable check',
          actorId,
        }),
      );

      // 3. Damaged: purchase $1,000, carrying $300
      const damagedAssetRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-V-3',
          name: 'Balance Trainer',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 1000.0, currency: 'USD' },
          currentEstimatedValue: { amount: 300.0, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );
      await changeStatusHandler.execute(
        new ChangeFixedAssetStatusCommand({
          tenantId,
          id: damagedAssetRes.getValue().id,
          status: AssetStatus.DAMAGED,
          reason: 'Cracked plastic housing',
          actorId,
        }),
      );

      const summaryRes = await getValuationSummaryHandler.execute(
        new GetFixedAssetValuationSummaryQuery({ tenantId }),
      );

      expect(summaryRes.isSuccess).toBe(true);
      const summary = summaryRes.getValue();

      // Carrying Value = 4000 + 2500 + 300 = 6800.00
      expect(summary.totalCarryingValueAmount).toBe(6800.0);
      // Total Purchase Value = 5000 + 3000 + 1000 = 9000.00
      expect(summary.totalPurchaseValueAmount).toBe(9000.0);
      expect(summary.totalAssetCount).toBe(3);
      expect(summary.activeAssetCount).toBe(3);
    });
  });

  // ============================================================================
  // 10. LOOKUP QUERIES INTEGRATION (BY ID & BY TAG)
  // ============================================================================
  describe('10. Lookup Queries Integration (By ID & By Tag)', () => {
    it('retrieves accurate DTO representations using GetFixedAssetById and GetFixedAssetByTag', async () => {
      const createRes = await createAssetHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-LOOKUP-01',
          name: 'Kettlebell Rack Heavy',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
          purchaseValue: { amount: 850.0, currency: 'USD' },
          location: { facilityId: 'fac_gym', roomId: 'free_weights' },
          actorId,
        }),
      );
      const assetId = createRes.getValue().id;

      // Lookup by ID
      const byIdRes = await getAssetByIdHandler.execute(
        new GetFixedAssetByIdQuery({ id: assetId, tenantId }),
      );
      expect(byIdRes.isSuccess).toBe(true);
      expect(byIdRes.getValue().assetTag).toBe('AST-LOOKUP-01');

      // Lookup by Tag
      const byTagRes = await getAssetByTagHandler.execute(
        new GetFixedAssetByTagQuery({ assetTag: 'AST-LOOKUP-01', tenantId }),
      );
      expect(byTagRes.isSuccess).toBe(true);
      expect(byTagRes.getValue().id).toBe(assetId);
    });
  });
});

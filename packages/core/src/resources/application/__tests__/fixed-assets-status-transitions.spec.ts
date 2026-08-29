import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { ChangeFixedAssetStatusCommand } from '../commands/change-fixed-asset-status.command';
import { ChangeFixedAssetStatusHandler } from '../handlers/change-fixed-asset-status.handler';
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
      throw new Error('Database connection failed during status change transaction.');
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

describe('Fixed Asset Lifecycle Status Transitions (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_maintenance_lead_01';

  beforeEach(() => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();
  });

  const createAssetInState = async (
    status: AssetStatus,
    condition: AssetCondition = AssetCondition.GOOD,
  ): Promise<FixedAsset> => {
    const asset = FixedAsset.create(
      {
        tenantId,
        assetTag: `AST-TEST-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        name: 'Pilates Reformer Clinical Model',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-01'),
        purchaseValue: Money.create(6500, 'USD'),
        currentEstimatedValue: Money.create(6500, 'USD'),
        condition,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({ facilityId: 'fac_main' }),
      },
      actorId,
    );

    if (status === AssetStatus.UNDER_MAINTENANCE) {
      asset.sendToMaintenance(actorId, 'Initial servicing setup');
    } else if (status === AssetStatus.DAMAGED) {
      asset.markAsDamaged(actorId, 'Initial breakdown discovery');
    } else if (status === AssetStatus.RETIRED) {
      asset.retire(actorId, 'Initial decommissioning');
    } else if (status === AssetStatus.SOLD) {
      asset.sell(Money.create(1500, 'USD'), actorId, 'Initial liquidation');
    }

    await repository.save(asset);
    return asset;
  };

  describe('1. Valid Operational Lifecycle Transitions', () => {
    it('transitions ACTIVE -> UNDER_MAINTENANCE with STATUS_CHANGED history', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Scheduled quarterly mechanical inspection',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.UNDER_MAINTENANCE);
      expect(res.value.historyEventsCount).toBe(2); // CREATED + STATUS_CHANGED
      const latestHistory = res.value.recentHistoryEvents?.[0];
      expect(latestHistory?.eventType).toBe(AssetHistoryEventType.STATUS_CHANGED);
      expect(latestHistory?.details).toEqual({
        priorStatus: AssetStatus.ACTIVE,
        newStatus: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Scheduled quarterly mechanical inspection',
      });
      expect(publisher.publishedEvents.length).toBe(1);
      expect(publisher.publishedEvents[0]?.eventType).toBe('AssetStatusChanged');
    });

    it('transitions ACTIVE -> DAMAGED when defect is reported', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.DAMAGED,
          reason: 'Carriage cable snapped during exercise session',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.DAMAGED);
      expect(res.value.recentHistoryEvents?.[0]?.eventType).toBe(
        AssetHistoryEventType.STATUS_CHANGED,
      );
    });

    it('transitions ACTIVE -> RETIRED (redirects to dedicated RETIRED history event)', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.RETIRED,
          reason: 'Equipment retired and replaced with next-generation model',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.RETIRED);
      expect(res.value.recentHistoryEvents?.[0]?.eventType).toBe(AssetHistoryEventType.RETIRED);
      expect(publisher.publishedEvents.length).toBe(1);
      expect(publisher.publishedEvents[0]?.eventType).toBe('AssetRetired');
    });

    it('transitions UNDER_MAINTENANCE -> ACTIVE upon service completion', async () => {
      const asset = await createAssetInState(AssetStatus.UNDER_MAINTENANCE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Maintenance successfully completed and recalibrated',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.ACTIVE);
    });

    it('transitions DAMAGED -> UNDER_MAINTENANCE when sent to workshop', async () => {
      const asset = await createAssetInState(AssetStatus.DAMAGED);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Dispatched to specialized repair workshop',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.UNDER_MAINTENANCE);
    });

    it('transitions DAMAGED -> ACTIVE directly if verified repaired', async () => {
      const asset = await createAssetInState(AssetStatus.DAMAGED, AssetCondition.GOOD);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Emergency on-site repair verified functional',
          actorId,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(AssetStatus.ACTIVE);
    });
  });

  describe('2. Invalid & Prohibited Lifecycle Transitions', () => {
    it('rejects same-state transition (no-op requestedStatus === currentStatus)', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Attempting redundant active transition',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("Asset is already in 'ACTIVE' status");
    });

    it('rejects direct changeStatus to SOLD (must use sell())', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.SOLD,
          reason: 'Direct liquidation attempt',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("Direct status change to 'SOLD' is prohibited");
    });

    it('prohibits recommissioning a RETIRED asset to ACTIVE', async () => {
      const asset = await createAssetInState(AssetStatus.RETIRED);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Attempting to revive retired equipment',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("Asset is RETIRED and cannot transition back to 'ACTIVE'");
    });

    it('prohibits servicing a RETIRED asset', async () => {
      const asset = await createAssetInState(AssetStatus.RETIRED);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Attempting maintenance on retired asset',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain(
        "Asset is RETIRED and cannot transition back to 'UNDER_MAINTENANCE'",
      );
    });

    it('prohibits modifying status of permanently SOLD assets (terminal lock)', async () => {
      const asset = await createAssetInState(AssetStatus.SOLD);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Attempting to un-sell asset',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("terminal state 'SOLD'");
    });

    it('prohibits restoring to ACTIVE if condition is OUT_OF_SERVICE', async () => {
      const asset = await createAssetInState(AssetStatus.DAMAGED, AssetCondition.OUT_OF_SERVICE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.ACTIVE,
          reason: 'Attempting restore while physically dangerous',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Cannot restore fixed asset');
      expect(res.error).toContain("condition is 'OUT_OF_SERVICE'");
    });
  });

  describe('3. Validation & Transaction Safety', () => {
    it('rejects status change when reason is shorter than 3 characters', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'ok',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain(
        'Mandatory reason for status change must be at least 3 characters',
      );
    });

    it('rejects status change when actor ID is missing', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);

      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Valid maintenance reason',
          actorId: '',
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Authenticated actor ID is required');
    });

    it('rolls back completely and prevents phantom events if persistence fails', async () => {
      const asset = await createAssetInState(AssetStatus.ACTIVE);
      repository.shouldFailSave = true;

      const handler = new ChangeFixedAssetStatusHandler(repository, publisher);
      const res = await handler.execute(
        new ChangeFixedAssetStatusCommand({
          id: asset.id.value,
          tenantId,
          status: AssetStatus.UNDER_MAINTENANCE,
          reason: 'Valid maintenance reason',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Database connection failed');

      // Verify DB remains untouched
      repository.shouldFailSave = false;
      const stored = await repository.findById(asset.id);
      expect(stored?.status).toBe(AssetStatus.ACTIVE);
      expect(stored?.version).toBe(1);
      expect(publisher.publishedEvents.length).toBe(0);
    });
  });
});

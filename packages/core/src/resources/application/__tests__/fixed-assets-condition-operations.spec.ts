import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { UpdateFixedAssetConditionCommand } from '../commands/update-fixed-asset-condition.command';
import { UpdateFixedAssetConditionHandler } from '../handlers/update-fixed-asset-condition.handler';
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
      throw new Error('Database connection failed during condition update transaction.');
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

describe('Fixed Asset Condition Rating Operations (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_facility_inspector_01';
  let initialAsset: FixedAsset;

  beforeEach(async () => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();

    initialAsset = FixedAsset.create(
      {
        tenantId,
        assetTag: 'AST-CRYO-01',
        name: 'Whole Body Cryotherapy Chamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-01'),
        purchaseValue: Money.create(55000, 'USD'),
        currentEstimatedValue: Money.create(55000, 'USD'),
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({ facilityId: 'fac_recovery_spa' }),
      },
      actorId,
    );

    await repository.save(initialAsset);
  });

  it('updates condition from EXCELLENT to NEEDS_REPAIR and creates CONDITION_CHANGED history event', async () => {
    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.NEEDS_REPAIR,
      reason: 'Liquid nitrogen delivery pressure valve seal leakage',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.condition).toBe(AssetCondition.NEEDS_REPAIR);
    expect(result.value.status).toBe(AssetStatus.ACTIVE); // Condition and Status remain orthogonal
    expect(result.value.version).toBe(2);
    expect(result.value.historyEventsCount).toBe(2); // CREATED + CONDITION_CHANGED

    const latestHistory = result.value.recentHistoryEvents?.[0];
    expect(latestHistory?.eventType).toBe(AssetHistoryEventType.CONDITION_CHANGED);
    expect(latestHistory?.recordedByUserId).toBe(actorId);
    expect(latestHistory?.details).toEqual({
      priorCondition: AssetCondition.EXCELLENT,
      newCondition: AssetCondition.NEEDS_REPAIR,
      reason: 'Liquid nitrogen delivery pressure valve seal leakage',
    });

    expect(publisher.publishedEvents.length).toBe(1);
    expect(publisher.publishedEvents[0]?.eventType).toBe('AssetConditionChanged');
  });

  it('treats updating to the same condition as an idempotent no-op without creating spurious history', async () => {
    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.EXCELLENT,
      reason: 'Same condition inspection report',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.version).toBe(1);
    expect(result.value.historyEventsCount).toBe(1); // No new history record
    expect(publisher.publishedEvents.length).toBe(0);
  });

  it('rejects condition change on permanently SOLD assets (Invariant [AST-INV-1])', async () => {
    initialAsset.sell(Money.create(15000, 'USD'), actorId, 'Liquidated salvage sale');
    await repository.save(initialAsset);

    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.FAIR,
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("terminal state 'SOLD'");
  });

  it('rejects condition change on decommissioned RETIRED assets (Invariant [AST-INV-1])', async () => {
    initialAsset.retire(actorId, 'Decommissioned due to age');
    await repository.save(initialAsset);

    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.FAIR,
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("state 'RETIRED'");
  });

  it('rejects condition change when actor ID is missing', async () => {
    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.GOOD,
      actorId: '',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Authenticated actor ID is required');
  });

  it('guarantees atomicity and rolls back on database failure', async () => {
    repository.shouldFailSave = true;

    const handler = new UpdateFixedAssetConditionHandler(repository, publisher);
    const command = new UpdateFixedAssetConditionCommand({
      id: initialAsset.id.value,
      tenantId,
      condition: AssetCondition.GOOD,
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Database connection failed');

    // Verify aggregate remains unmodified
    repository.shouldFailSave = false;
    const stored = await repository.findById(initialAsset.id);
    expect(stored?.condition).toBe(AssetCondition.EXCELLENT);
    expect(stored?.version).toBe(1);
    expect(publisher.publishedEvents.length).toBe(0);
  });
});

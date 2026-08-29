import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { UpdateFixedAssetValuationCommand } from '../commands/update-fixed-asset-valuation.command';
import { UpdateFixedAssetValuationHandler } from '../handlers/update-fixed-asset-valuation.handler';
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
      throw new Error('Database connection failed during valuation update transaction.');
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

describe('Fixed Asset Valuation & Revaluation Operations (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_finance_mgr_01';
  let initialAsset: FixedAsset;

  beforeEach(async () => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();

    initialAsset = FixedAsset.create(
      {
        tenantId,
        assetTag: 'AST-DEXA-01',
        name: 'Dual-Energy X-ray Absorptiometry (DEXA) Body Scanner',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2025-01-01'),
        purchaseValue: Money.create(85000.0, 'USD'),
        currentEstimatedValue: Money.create(85000.0, 'USD'),
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({ facilityId: 'fac_imaging_suite' }),
      },
      actorId,
    );

    await repository.save(initialAsset);
  });

  it('updates estimated economic book value (decrease/depreciation) and creates VALUE_UPDATED history', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: {
        amount: 72500.5,
        currency: 'USD',
      },
      reason: 'Annual straight-line depreciation audit valuation',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.currentEstimatedValueAmount).toBe(72500.5);
    expect(result.value.purchaseValueAmount).toBe(85000.0); // Purchase value remains completely untouched
    expect(result.value.version).toBe(2);
    expect(result.value.historyEventsCount).toBe(2); // CREATED + VALUE_UPDATED

    const latestHistory = result.value.recentHistoryEvents?.[0];
    expect(latestHistory?.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);
    expect(latestHistory?.recordedByUserId).toBe(actorId);
    expect(latestHistory?.details).toEqual({
      priorValue: { amount: 85000.0, currency: 'USD' },
      newValue: { amount: 72500.5, currency: 'USD' },
      reason: 'Annual straight-line depreciation audit valuation',
    });

    expect(publisher.publishedEvents.length).toBe(1);
    expect(publisher.publishedEvents[0]?.eventType).toBe('AssetValuationUpdated');
  });

  it('supports appreciation/revaluation and preserves 2 decimal places precision', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: {
        amount: 89999.994, // Should round deterministically to 89999.99
        currency: 'USD',
      },
      reason: 'Equipment market value adjustment post certified factory overhaul',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.currentEstimatedValueAmount).toBe(89999.99);
  });

  it('allows reducing estimated value to zero ($0.00 fully depreciated book value)', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: {
        amount: 0.0,
        currency: 'USD',
      },
      reason: 'Fully written off to zero net book value',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.currentEstimatedValueAmount).toBe(0.0);
  });

  it('rejects negative estimated value amount', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: {
        amount: -100.0,
        currency: 'USD',
      },
      reason: 'Invalid negative valuation',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('must be a non-negative number');
  });

  it('treats updating to the identical valuation as an idempotent no-op without creating spurious history', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: {
        amount: 85000.0,
        currency: 'USD',
      },
      reason: 'Unchanged valuation check',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.version).toBe(1);
    expect(result.value.historyEventsCount).toBe(1); // No new history
    expect(publisher.publishedEvents.length).toBe(0);
  });

  it('rejects valuation updates on permanently SOLD assets (Invariant [AST-INV-1])', async () => {
    initialAsset.sell(Money.create(20000, 'USD'), actorId, 'Liquidated salvage sale');
    await repository.save(initialAsset);

    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: { amount: 25000, currency: 'USD' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("terminal state 'SOLD'");
  });

  it('rejects valuation update when actor ID is missing', async () => {
    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: { amount: 60000, currency: 'USD' },
      actorId: '',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Authenticated actor ID is required');
  });

  it('guarantees atomicity and rolls back on database transaction failure', async () => {
    repository.shouldFailSave = true;

    const handler = new UpdateFixedAssetValuationHandler(repository, publisher);
    const command = new UpdateFixedAssetValuationCommand({
      id: initialAsset.id.value,
      tenantId,
      estimatedValue: { amount: 60000, currency: 'USD' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Database connection failed');

    // Verify repository in-memory state remains untouched
    repository.shouldFailSave = false;
    const stored = await repository.findById(initialAsset.id);
    expect(stored?.currentEstimatedValue.amount).toBe(85000.0);
    expect(stored?.version).toBe(1);
    expect(publisher.publishedEvents.length).toBe(0);
  });
});

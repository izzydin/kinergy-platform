import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { TransferFixedAssetLocationCommand } from '../commands/transfer-fixed-asset-location.command';
import { TransferFixedAssetLocationHandler } from '../handlers/transfer-fixed-asset-location.handler';
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
      throw new Error('Database transaction connection aborted during atomic commit.');
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

describe('Fixed Asset Location Transfer Workflow (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_facility_ops_lead';
  let initialAsset: FixedAsset;

  beforeEach(async () => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();

    initialAsset = FixedAsset.create(
      {
        tenantId,
        assetTag: 'AST-REHAB-01',
        name: 'Isokinetic Rehabilitation Dynamometer',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-01'),
        purchaseValue: Money.create(45000, 'USD'),
        currentEstimatedValue: Money.create(45000, 'USD'),
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({
          facilityId: 'fac_clinic_north',
          roomId: 'room_assessment_1',
          zone: 'Clinical Suite A',
          description: 'North Wing 2nd Floor',
        }),
      },
      actorId,
    );

    await repository.save(initialAsset);
  });

  it('transfers an asset to a new physical location atomically and creates a TRANSFERRED history event', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: {
        facilityId: 'fac_clinic_south',
        roomId: 'room_rehab_main',
        zone: 'Treatment Floor',
        description: 'South Campus Pavilion',
      },
      reason: 'Department expansion and facility realignment',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.location.facilityId).toBe('fac_clinic_south');
    expect(result.value.location.roomId).toBe('room_rehab_main');
    expect(result.value.location.zone).toBe('Treatment Floor');
    expect(result.value.version).toBe(2);
    expect(result.value.historyEventsCount).toBe(2); // Initial CREATED + TRANSFERRED

    // Verify history details
    const latestHistory = result.value.recentHistoryEvents?.[0];
    expect(latestHistory?.eventType).toBe(AssetHistoryEventType.TRANSFERRED);
    expect(latestHistory?.recordedByUserId).toBe(actorId);
    expect(latestHistory?.description).toContain('Location transferred');
    expect(latestHistory?.details).toEqual({
      priorLocation: {
        facilityId: 'fac_clinic_north',
        roomId: 'room_assessment_1',
        zone: 'Clinical Suite A',
        description: 'North Wing 2nd Floor',
      },
      newLocation: {
        facilityId: 'fac_clinic_south',
        roomId: 'room_rehab_main',
        zone: 'Treatment Floor',
        description: 'South Campus Pavilion',
      },
      reason: 'Department expansion and facility realignment',
    });

    // Verify published domain event
    expect(publisher.publishedEvents.length).toBe(1);
    expect(publisher.publishedEvents[0]?.eventType).toBe('AssetTransferred');
  });

  it('treats transfer to the exact same location as an idempotent no-op without creating spurious history', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: {
        facilityId: 'fac_clinic_north',
        roomId: 'room_assessment_1',
        zone: 'Clinical Suite A',
        description: 'North Wing 2nd Floor',
      },
      reason: 'Same location attempt',
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.version).toBe(1); // Version remained unchanged
    expect(result.value.historyEventsCount).toBe(1); // No new history event generated
    expect(publisher.publishedEvents.length).toBe(0); // No event published
  });

  it('fails with not-found error when asset ID does not exist', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: 'e9999999-9999-4999-8999-999999999999',
      tenantId,
      location: { facilityId: 'fac_destination' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('was not found');
  });

  it('validates destination and rejects empty facilityId', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: '' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Facility ID is mandatory');
  });

  it('validates destination and rejects empty roomId string if provided', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: 'fac_valid', roomId: '   ' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Room ID cannot be empty string');
  });

  it('rejects transfer on permanently SOLD assets (Invariant [AST-INV-1])', async () => {
    initialAsset.sell(Money.create(10000, 'USD'), actorId, 'Liquidated to third party');
    await repository.save(initialAsset);

    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: 'fac_new_clinic' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("terminal state 'SOLD'");
  });

  it('rejects transfer on decommissioned RETIRED assets (Invariant [AST-INV-1])', async () => {
    initialAsset.retire(actorId, 'Decommissioned from service due to age');
    await repository.save(initialAsset);

    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: 'fac_new_clinic' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("state 'RETIRED'");
  });

  it('rejects transfer when actor ID is missing', async () => {
    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: 'fac_new_clinic' },
      actorId: '',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Authenticated actor ID is required');
  });

  it('guarantees atomicity and rolls back if database save fails', async () => {
    repository.shouldFailSave = true;

    const handler = new TransferFixedAssetLocationHandler(repository, publisher);
    const command = new TransferFixedAssetLocationCommand({
      id: initialAsset.id.value,
      tenantId,
      location: { facilityId: 'fac_new_clinic' },
      actorId,
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Database transaction connection aborted');

    // Verify repository in-memory state remains untouched
    repository.shouldFailSave = false;
    const stored = await repository.findById(initialAsset.id);
    expect(stored?.location.facilityId).toBe('fac_clinic_north');
    expect(stored?.version).toBe(1);
    expect(stored?.historyEvents.length).toBe(1); // No orphan history
    expect(publisher.publishedEvents.length).toBe(0); // No phantom events published
  });
});

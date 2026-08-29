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
import { CreateFixedAssetCommand } from '../commands/create-fixed-asset.command';
import { UpdateFixedAssetDetailsCommand } from '../commands/update-fixed-asset-details.command';
import { GetFixedAssetByIdQuery } from '../queries/get-fixed-asset-by-id.query';
import { GetFixedAssetByTagQuery } from '../queries/get-fixed-asset-by-tag.query';
import { ListFixedAssetsQuery, FixedAssetSortBy } from '../queries/list-fixed-assets.query';
import { CreateFixedAssetHandler } from '../handlers/create-fixed-asset.handler';
import { UpdateFixedAssetDetailsHandler } from '../handlers/update-fixed-asset-details.handler';
import { GetFixedAssetByIdHandler } from '../handlers/get-fixed-asset-by-id.handler';
import { GetFixedAssetByTagHandler } from '../handlers/get-fixed-asset-by-tag.handler';
import { ListFixedAssetsHandler } from '../handlers/list-fixed-assets.handler';
import { OptimisticLockException } from '../../domain/inventory/exceptions/optimistic-lock.exception';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  public store = new Map<string, { asset: FixedAsset; version: number }>();

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

  async findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]> {
    let list = Array.from(this.store.values()).map((e) => this.clone(e.asset));

    if (filter?.tenantId) {
      list = list.filter((a) => a.tenantId === filter.tenantId);
    }

    if (filter?.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      list = list.filter((a) => cats.includes(a.category));
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      list = list.filter((a) => statuses.includes(a.status));
    } else if (!filter?.includeDecommissioned) {
      // Default: operational only
      list = list.filter((a) =>
        [AssetStatus.ACTIVE, AssetStatus.UNDER_MAINTENANCE, AssetStatus.DAMAGED].includes(a.status),
      );
    }

    if (filter?.condition) {
      const conds = Array.isArray(filter.condition) ? filter.condition : [filter.condition];
      list = list.filter((a) => conds.includes(a.condition));
    }

    if (filter?.facilityId) {
      list = list.filter((a) => a.location.facilityId === filter.facilityId);
    }

    if (filter?.roomId) {
      list = list.filter((a) => a.location.roomId === filter.roomId);
    }

    if (filter?.search) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.assetTag.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }

    // Sort
    const sortField = filter?.sortBy ?? 'name';
    const sortOrder = filter?.sortOrder === 'desc' ? -1 : 1;

    list.sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      switch (sortField) {
        case 'assetTag':
          valA = a.assetTag;
          valB = b.assetTag;
          break;
        case 'category':
          valA = a.category;
          valB = b.category;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'condition':
          valA = a.condition;
          valB = b.condition;
          break;
        case 'purchaseDate':
          valA = a.purchaseDate.getTime();
          valB = b.purchaseDate.getTime();
          break;
        case 'purchaseValueAmount':
          valA = a.purchaseValue.amount;
          valB = b.purchaseValue.amount;
          break;
        case 'currentEstimatedValueAmount':
          valA = a.currentEstimatedValue.amount;
          valB = b.currentEstimatedValue.amount;
          break;
        case 'createdAt':
          valA = a.createdAt.getTime();
          valB = b.createdAt.getTime();
          break;
        case 'updatedAt':
          valA = a.updatedAt.getTime();
          valB = b.updatedAt.getTime();
          break;
        case 'name':
        default:
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
      }

      if (valA! < valB!) return -1 * sortOrder;
      if (valA! > valB!) return 1 * sortOrder;
      // Secondary tie breaker
      return a.id.value.localeCompare(b.id.value);
    });

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? list.length;
    return list.slice(offset, offset + limit);
  }

  async count(filter?: FixedAssetFilterOptions): Promise<number> {
    const list = await this.findAll({ ...filter, limit: undefined, offset: undefined });
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
      historyEvents: [...asset.historyEvents],
      maintenanceRecords: [...asset.maintenanceRecords],
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }
}

describe('Fixed Assets Core Application Layer (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_facility_mgr_01';

  beforeEach(() => {
    repository = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();
  });

  describe('1. CreateFixedAsset Use Case', () => {
    it('creates a fixed asset with valid inputs and initial CREATED history', async () => {
      const handler = new CreateFixedAssetHandler(repository, publisher);
      const cmd = new CreateFixedAssetCommand({
        tenantId,
        assetTag: 'AST-GYM-001',
        name: 'Dual-Pulley Functional Trainer',
        description: 'Commercial cable resistance machine',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2026-01-15T00:00:00Z'),
        purchaseValue: { amount: 4500.0, currency: 'USD' },
        currentEstimatedValue: { amount: 4500.0, currency: 'USD' },
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: {
          facilityId: 'fac_main_gym',
          roomId: 'room_strength_01',
          zone: 'Free Weights Area',
          description: 'Main Building 1st Floor',
        },
        notes: 'Installed by manufacturer certified technician',
        actorId,
      });

      const res = await handler.execute(cmd);
      expect(res.isSuccess).toBe(true);
      expect(res.value.assetTag).toBe('AST-GYM-001');
      expect(res.value.status).toBe(AssetStatus.ACTIVE);
      expect(res.value.condition).toBe(AssetCondition.EXCELLENT);
      expect(res.value.purchaseValueAmount).toBe(4500.0);
      expect(res.value.location.facilityId).toBe('fac_main_gym');
      expect(res.value.historyEventsCount).toBe(1);

      // Verify domain events published
      expect(publisher.publishedEvents.length).toBe(1);
      expect(publisher.publishedEvents[0]?.eventType).toBe('AssetCreated');
    });

    it('rejects duplicate asset tag within the same tenant', async () => {
      const handler = new CreateFixedAssetHandler(repository, publisher);
      await handler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-DUPLICATE-01',
          name: 'Original Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: { amount: 2000, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );

      const collisionRes = await handler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-DUPLICATE-01',
          name: 'Colliding Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2026-02-01'),
          purchaseValue: { amount: 2500, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );

      expect(collisionRes.isFailure).toBe(true);
      expect(collisionRes.error).toContain('already exists');
    });

    it('rejects negative monetary amounts', async () => {
      const handler = new CreateFixedAssetHandler(repository, publisher);
      const res = await handler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-NEG-001',
          name: 'Invalid Price Device',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: { amount: -500, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('cannot be negative');
    });

    it('rejects invalid initial statuses like RETIRED or SOLD', async () => {
      const handler = new CreateFixedAssetHandler(repository, publisher);
      const res = await handler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-RETIRED-INIT',
          name: 'Cannot start retired',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: { amount: 1000, currency: 'USD' },
          status: AssetStatus.RETIRED,
          location: { facilityId: 'fac_main' },
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Invalid initial asset status');
    });

    it('rejects missing actor ID', async () => {
      const handler = new CreateFixedAssetHandler(repository, publisher);
      const res = await handler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-NO-ACTOR',
          name: 'No Actor Asset',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: { amount: 1000, currency: 'USD' },
          location: { facilityId: 'fac_main' },
          actorId: '',
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Authenticated actor ID is required');
    });
  });

  describe('2. UpdateFixedAssetDetails Use Case', () => {
    let assetId: string;

    beforeEach(async () => {
      const createHandler = new CreateFixedAssetHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-UPDATE-01',
          name: 'Original Ultrasound Scanner',
          description: 'Standard 3.5MHz transducer',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-10'),
          purchaseValue: { amount: 12000, currency: 'USD' },
          location: { facilityId: 'fac_clinic_01', roomId: 'room_scan_1' },
          notes: 'Initial purchase notes',
          actorId,
        }),
      );
      assetId = created.value.id;
    });

    it('updates allowed metadata fields and records an UPDATED history event', async () => {
      const updateHandler = new UpdateFixedAssetDetailsHandler(repository, publisher);
      const res = await updateHandler.execute(
        new UpdateFixedAssetDetailsCommand({
          id: assetId,
          tenantId,
          name: 'High-Frequency Ultrasound Scanner Pro',
          description: 'Upgraded dual transducer 3.5MHz / 7.5MHz',
          notes: 'Software firmware updated to v2.4',
          reason: 'Hardware description correction',
          actorId: 'usr_tech_02',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.name).toBe('High-Frequency Ultrasound Scanner Pro');
      expect(res.value.description).toBe('Upgraded dual transducer 3.5MHz / 7.5MHz');
      expect(res.value.notes).toBe('Software firmware updated to v2.4');
      // History entries incremented from 1 (CREATED) to 2 (UPDATED)
      expect(res.value.historyEventsCount).toBe(2);
      expect(res.value.recentHistoryEvents?.[0]?.eventType).toBe(AssetHistoryEventType.UPDATED);
    });

    it('produces zero history events on no-op updates (meaningful audit rule)', async () => {
      const updateHandler = new UpdateFixedAssetDetailsHandler(repository, publisher);
      const res = await updateHandler.execute(
        new UpdateFixedAssetDetailsCommand({
          id: assetId,
          tenantId,
          name: 'Original Ultrasound Scanner', // identical name
          description: 'Standard 3.5MHz transducer', // identical description
          notes: 'Initial purchase notes', // identical notes
          actorId: 'usr_tech_02',
        }),
      );

      expect(res.isSuccess).toBe(true);
      // History remains strictly 1 (no spurious no-op history records)
      expect(res.value.historyEventsCount).toBe(1);
    });

    it('prohibits updating details on permanently SOLD assets', async () => {
      const asset = await repository.findById(AssetId.create(assetId));
      asset!.sell(Money.create(5000, 'USD'), actorId, 'Liquidated salvage');
      await repository.save(asset!);

      const updateHandler = new UpdateFixedAssetDetailsHandler(repository, publisher);
      const res = await updateHandler.execute(
        new UpdateFixedAssetDetailsCommand({
          id: assetId,
          tenantId,
          name: 'Attempt update on sold item',
          actorId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain("terminal state 'SOLD'");
    });
  });

  describe('3. GetFixedAssetById and GetFixedAssetByTag', () => {
    let assetId: string;

    beforeEach(async () => {
      const createHandler = new CreateFixedAssetHandler(repository, publisher);
      const created = await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-GET-001',
          name: 'Traction Decompression Table',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-05'),
          purchaseValue: { amount: 8500, currency: 'USD' },
          location: { facilityId: 'fac_rehab_main', roomId: 'room_traction_1' },
          actorId,
        }),
      );
      assetId = created.value.id;
    });

    it('retrieves asset by ID successfully', async () => {
      const handler = new GetFixedAssetByIdHandler(repository);
      const res = await handler.execute(new GetFixedAssetByIdQuery({ id: assetId, tenantId }));
      expect(res.isSuccess).toBe(true);
      expect(res.value.assetTag).toBe('AST-GET-001');
      expect(res.value.category).toBe(AssetCategory.THERAPY_EQUIPMENT);
    });

    it('retrieves asset by tag (case-insensitive) successfully', async () => {
      const handler = new GetFixedAssetByTagHandler(repository);
      const res = await handler.execute(
        new GetFixedAssetByTagQuery({ assetTag: 'ast-get-001', tenantId }),
      );
      expect(res.isSuccess).toBe(true);
      expect(res.value.id).toBe(assetId);
    });

    it('returns clean not found failure for non-existent ID or tag', async () => {
      const byIdHandler = new GetFixedAssetByIdHandler(repository);
      const byTagHandler = new GetFixedAssetByTagHandler(repository);

      const resId = await byIdHandler.execute(
        new GetFixedAssetByIdQuery({ id: 'non_existent_id', tenantId }),
      );
      expect(resId.isFailure).toBe(true);
      expect(resId.error).toContain('was not found');

      const resTag = await byTagHandler.execute(
        new GetFixedAssetByTagQuery({ assetTag: 'NON-EXISTENT-TAG', tenantId }),
      );
      expect(resTag.isFailure).toBe(true);
      expect(resTag.error).toContain('was not found');
    });
  });

  describe('4. ListFixedAssets Use Case & Query Contract', () => {
    beforeEach(async () => {
      const createHandler = new CreateFixedAssetHandler(repository, publisher);

      // Asset 1: Cardio Treadmill A
      await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-TM-01',
          name: 'Commercial Treadmill Apex 900',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: { amount: 3500, currency: 'USD' },
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: { facilityId: 'fac_downtown', roomId: 'room_cardio' },
          actorId,
        }),
      );

      // Asset 2: Clinical Laser Unit
      await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-LZ-02',
          name: 'Class IV Therapeutic Laser',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2026-01-15'),
          purchaseValue: { amount: 15000, currency: 'USD' },
          condition: AssetCondition.GOOD,
          status: AssetStatus.ACTIVE,
          location: { facilityId: 'fac_downtown', roomId: 'room_laser' },
          actorId,
        }),
      );

      // Asset 3: Damaged Leg Press
      await createHandler.execute(
        new CreateFixedAssetCommand({
          tenantId,
          assetTag: 'AST-LP-03',
          name: '45-Degree Incline Leg Press',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2025-06-01'),
          purchaseValue: { amount: 2800, currency: 'USD' },
          condition: AssetCondition.NEEDS_REPAIR,
          status: AssetStatus.DAMAGED,
          location: { facilityId: 'fac_uptown', roomId: 'room_heavy_weights' },
          actorId,
        }),
      );

      // Asset 4: Decommissioned Fixture (RETIRED)
      const asset4 = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-RET-04',
          name: 'Old Hydrocollator Heating Unit',
          category: AssetCategory.THERAPY_EQUIPMENT,
          purchaseDate: new Date('2020-01-01'),
          purchaseValue: Money.create(800, 'USD'),
          currentEstimatedValue: Money.create(100, 'USD'),
          condition: AssetCondition.FAIR,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_uptown' }),
        },
        actorId,
      );
      asset4.retire(actorId, 'Beyond economic repair');
      await repository.save(asset4);
    });

    it('lists operational assets by default excluding retired/sold assets', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(new ListFixedAssetsQuery({ tenantId }));

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(3); // 3 operational, 1 retired excluded
      const tags = res.value.items.map((i) => i.assetTag);
      expect(tags).toContain('AST-TM-01');
      expect(tags).toContain('AST-LZ-02');
      expect(tags).toContain('AST-LP-03');
      expect(tags).not.toContain('AST-RET-04');
    });

    it('includes retired assets when includeDecommissioned is true', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: { includeDecommissioned: true },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(4);
      const tags = res.value.items.map((i) => i.assetTag);
      expect(tags).toContain('AST-RET-04');
    });

    it('filters by category and facility location accurately', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: {
            category: AssetCategory.GYM_EQUIPMENT,
            facilityId: 'fac_downtown',
          },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.assetTag).toBe('AST-TM-01');
    });

    it('filters by condition accurately', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: {
            condition: AssetCondition.NEEDS_REPAIR,
          },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.assetTag).toBe('AST-LP-03');
    });

    it('supports case-insensitive search across name and description', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: {
            search: 'laser',
          },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.assetTag).toBe('AST-LZ-02');
    });

    it('sorts by purchaseValueAmount descending with stable tie-breaking', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: {
            sortBy: 'purchaseValueAmount',
            sortOrder: 'desc',
          },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.items[0]?.assetTag).toBe('AST-LZ-02'); // $15,000
      expect(res.value.items[1]?.assetTag).toBe('AST-TM-01'); // $3,500
      expect(res.value.items[2]?.assetTag).toBe('AST-LP-03'); // $2,800
    });

    it('rejects invalid sortBy field with descriptive validation error', async () => {
      const handler = new ListFixedAssetsHandler(repository);
      const res = await handler.execute(
        new ListFixedAssetsQuery({
          tenantId,
          filter: {
            sortBy: 'invalid_field_name' as unknown as FixedAssetSortBy,
          },
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('Invalid sort field');
    });
  });
});

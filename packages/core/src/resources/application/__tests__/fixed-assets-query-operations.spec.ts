import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { AssetHistoryEventType } from '../../domain/assets/enums/asset-history-event-type.enum';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { GetAssetHistoryQuery } from '../queries/get-asset-history.query';
import { GetAssetHistoryHandler } from '../handlers/get-asset-history.handler';
import { GetMaintenanceHistoryQuery } from '../queries/get-maintenance-history.query';
import { GetMaintenanceHistoryHandler } from '../handlers/get-maintenance-history.handler';
import { GetAssetValueQuery } from '../queries/get-asset-value.query';
import { GetAssetValueHandler } from '../handlers/get-asset-value.handler';

class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  public store = new Map<string, FixedAsset>();

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
    this.store.set(asset.id.value, this.clone(asset));
  }

  async findAll(): Promise<FixedAsset[]> {
    return Array.from(this.store.values()).map((a) => this.clone(a));
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

describe('Fixed Asset Read & Query Operations (Phase 6.6)', () => {
  let repository: InMemoryFixedAssetRepository;
  const tenantId = 'tenant_kinergy_hq';
  const actorId = 'usr_analyst_01';
  let populatedAsset: FixedAsset;

  beforeEach(async () => {
    repository = new InMemoryFixedAssetRepository();

    populatedAsset = FixedAsset.create(
      {
        tenantId,
        assetTag: 'AST-RECOVERY-POD-01',
        name: 'Infrared Sauna & Photobiomodulation Pod',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-01'),
        purchaseValue: Money.create(35000.0, 'USD'),
        currentEstimatedValue: Money.create(32500.5, 'USD'),
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: AssetLocation.create({ facilityId: 'fac_spa', roomId: 'rm_sauna_01' }),
      },
      actorId,
    );

    // Create a chronological timeline of events
    populatedAsset.transferLocation(
      AssetLocation.create({ facilityId: 'fac_spa', roomId: 'rm_sauna_02' }),
      actorId,
      'Moved to larger private recovery suite',
    );
    populatedAsset.sendToMaintenance(actorId, 'Routine quarterly emitter check');
    populatedAsset.recordMaintenance(
      {
        serviceDate: new Date('2026-04-10'),
        description: 'Infrared bulb replacement and recalibration',
        cost: Money.create(450.0, 'USD'),
        performedBy: 'Clearlight Certified Tech',
        updateConditionTo: AssetCondition.EXCELLENT,
      },
      actorId,
    );
    populatedAsset.updateEstimatedValue(
      Money.create(31000.0, 'USD'),
      actorId,
      'Mid-year valuation adjustment',
    );

    await repository.save(populatedAsset);
  });

  describe('1. GetAssetHistory', () => {
    it('returns deterministic paginated history with newest-first ordering', async () => {
      const handler = new GetAssetHistoryHandler(repository);
      const query = new GetAssetHistoryQuery({
        assetId: populatedAsset.id.value,
        tenantId,
        page: 1,
        pageSize: 10,
        sortOrder: 'desc',
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(5); // CREATED + TRANSFERRED + STATUS_CHANGED + MAINTENANCE_RECORDED + VALUE_UPDATED
      expect(res.value.items.length).toBe(5);
      expect(res.value.items[0]?.eventType).toBe(AssetHistoryEventType.VALUE_UPDATED);
      expect(res.value.items[4]?.eventType).toBe(AssetHistoryEventType.CREATED);
    });

    it('filters history by specific event types', async () => {
      const handler = new GetAssetHistoryHandler(repository);
      const query = new GetAssetHistoryQuery({
        assetId: populatedAsset.id.value,
        tenantId,
        eventType: [AssetHistoryEventType.TRANSFERRED, AssetHistoryEventType.VALUE_UPDATED],
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(2);
      expect(res.value.items.map((i) => i.eventType)).toEqual([
        AssetHistoryEventType.VALUE_UPDATED,
        AssetHistoryEventType.TRANSFERRED,
      ]);
    });

    it('filters history by date range', async () => {
      const handler = new GetAssetHistoryHandler(repository);
      const query = new GetAssetHistoryQuery({
        assetId: populatedAsset.id.value,
        tenantId,
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(5);
    });

    it('rejects invalid date range (fromDate > toDate)', async () => {
      const handler = new GetAssetHistoryHandler(repository);
      const query = new GetAssetHistoryQuery({
        assetId: populatedAsset.id.value,
        tenantId,
        fromDate: '2026-12-31',
        toDate: '2026-01-01',
      });

      const res = await handler.execute(query);

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('fromDate cannot be after toDate');
    });

    it('fails when asset is not found or tenant does not match', async () => {
      const handler = new GetAssetHistoryHandler(repository);
      const res = await handler.execute(
        new GetAssetHistoryQuery({
          assetId: populatedAsset.id.value,
          tenantId: 'other_tenant_id',
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('was not found');
    });
  });

  describe('2. GetMaintenanceHistory', () => {
    it('returns filtered maintenance history for the asset', async () => {
      const handler = new GetMaintenanceHistoryHandler(repository);
      const query = new GetMaintenanceHistoryQuery({
        assetId: populatedAsset.id.value,
        tenantId,
        performedBy: 'Clearlight',
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.description).toContain('Infrared bulb replacement');
      expect(res.value.items[0]?.costAmount).toBe(450.0);
    });

    it('returns empty list for assets with no maintenance records', async () => {
      const freshAsset = FixedAsset.create(
        {
          tenantId,
          assetTag: 'AST-FRESH-01',
          name: 'Fresh New Treadmill',
          category: AssetCategory.GYM_EQUIPMENT,
          purchaseDate: new Date('2026-01-01'),
          purchaseValue: Money.create(5000, 'USD'),
          currentEstimatedValue: Money.create(5000, 'USD'),
          condition: AssetCondition.EXCELLENT,
          status: AssetStatus.ACTIVE,
          location: AssetLocation.create({ facilityId: 'fac_main' }),
        },
        actorId,
      );
      await repository.save(freshAsset);

      const handler = new GetMaintenanceHistoryHandler(repository);
      const query = new GetMaintenanceHistoryQuery({
        assetId: freshAsset.id.value,
        tenantId,
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(0);
      expect(res.value.items).toEqual([]);
    });
  });

  describe('3. GetAssetValue', () => {
    it('returns valuation details with purchase and estimated amounts', async () => {
      const handler = new GetAssetValueHandler(repository);
      const query = new GetAssetValueQuery({
        assetId: populatedAsset.id.value,
        tenantId,
      });

      const res = await handler.execute(query);

      expect(res.isSuccess).toBe(true);
      expect(res.value.assetTag).toBe('AST-RECOVERY-POD-01');
      expect(res.value.purchaseValueAmount).toBe(35000.0);
      expect(res.value.purchaseValueCurrency).toBe('USD');
      expect(res.value.currentEstimatedValueAmount).toBe(31000.0);
      expect(res.value.currentEstimatedValueCurrency).toBe('USD');
      expect(res.value.status).toBe(AssetStatus.ACTIVE);
      expect(res.value.condition).toBe(AssetCondition.EXCELLENT);
    });

    it('fails when asset is not found', async () => {
      const handler = new GetAssetValueHandler(repository);
      const res = await handler.execute(
        new GetAssetValueQuery({
          assetId: '00000000-0000-0000-0000-000000000000',
          tenantId,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.error).toContain('was not found');
    });
  });
});

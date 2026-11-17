import { CreateFixedAssetHandler } from '../handlers/create-fixed-asset.handler';
import { TransferFixedAssetLocationHandler } from '../handlers/transfer-fixed-asset-location.handler';
import { CreateFixedAssetCommand } from '../commands/create-fixed-asset.command';
import { TransferFixedAssetLocationCommand } from '../commands/transfer-fixed-asset-location.command';
import { DefaultTenantFacilityCatalogService } from '../services/default-tenant-facility-catalog.service';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetCategory } from '../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';

class InMemoryFixedAssetRepository implements FixedAssetRepositoryInterface {
  public store = new Map<string, FixedAsset>();

  async findById(id: AssetId): Promise<FixedAsset | null> {
    const asset = this.store.get(id.value);
    return asset ?? null;
  }

  async findByAssetTag(assetTag: string, tenantId?: string): Promise<FixedAsset | null> {
    const norm = assetTag.trim().toUpperCase();
    for (const asset of this.store.values()) {
      if (asset.assetTag === norm && (!tenantId || asset.tenantId === tenantId)) {
        return asset;
      }
    }
    return null;
  }

  async save(asset: FixedAsset): Promise<void> {
    this.store.set(asset.id.value, asset);
  }

  async delete(id: AssetId): Promise<void> {
    this.store.delete(id.value);
  }

  async findAll(): Promise<FixedAsset[]> {
    return Array.from(this.store.values());
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];
  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }
}

describe('Fixed Assets Facility Catalog Validation & Isolation', () => {
  let repo: InMemoryFixedAssetRepository;
  let publisher: MockEventPublisher;
  let catalogService: DefaultTenantFacilityCatalogService;
  let createHandler: CreateFixedAssetHandler;
  let transferHandler: TransferFixedAssetLocationHandler;

  beforeEach(() => {
    repo = new InMemoryFixedAssetRepository();
    publisher = new MockEventPublisher();
    catalogService = new DefaultTenantFacilityCatalogService();
    createHandler = new CreateFixedAssetHandler(repo, publisher, catalogService);
    transferHandler = new TransferFixedAssetLocationHandler(repo, publisher, catalogService);
  });

  describe('DefaultTenantFacilityCatalogService', () => {
    it('returns only facilities belonging to the requested tenant', async () => {
      const facilities = await catalogService.getFacilitiesForTenant('tenant-kinergy-main');
      expect(facilities.length).toBeGreaterThan(0);
      expect(facilities.every((f) => f.tenantId === 'tenant-kinergy-main')).toBe(true);
    });

    it('returns empty array when tenant is unknown', async () => {
      const facilities = await catalogService.getFacilitiesForTenant('tenant-unknown-999');
      expect(facilities).toEqual([]);
    });

    it('validates valid facility for tenant', async () => {
      const res = await catalogService.validateFacilityAccess('tenant-kinergy-main', 'fac-main');
      expect(res.valid).toBe(true);
    });

    it('rejects facility belonging to another tenant or non-existent', async () => {
      const resOtherTenant = await catalogService.validateFacilityAccess(
        'tenant-other',
        'fac-main',
      );
      expect(resOtherTenant.valid).toBe(false);

      const resNonExistent = await catalogService.validateFacilityAccess(
        'tenant-kinergy-main',
        'fac-nonexistent',
      );
      expect(resNonExistent.valid).toBe(false);
    });

    it('correctly resolves facility by ID and tenant', async () => {
      const fac = await catalogService.getFacilityById('tenant-kinergy-main', 'fac-main');
      expect(fac).toBeDefined();
      expect(fac?.code).toBe('FAC-MAIN');

      const facWrongTenant = await catalogService.getFacilityById('tenant-other', 'fac-main');
      expect(facWrongTenant).toBeNull();
    });
  });

  describe('CreateFixedAssetHandler with Facility Catalog', () => {
    it('successfully creates an asset when facility belongs to tenant', async () => {
      const command = new CreateFixedAssetCommand({
        name: 'Commercial Incline Treadmill Pro',
        assetTag: 'AST-PLINTH-01',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2026-01-15'),
        purchaseValue: { amount: 4500, currency: 'USD' },
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        location: {
          facilityId: 'fac-main',
          roomId: 'room-seed-kinesio-01',
          zone: 'Zone A',
        },
        tenantId: 'tenant-kinergy-main',
        actorId: 'usr-admin-01',
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.value?.location.facilityId).toBe('fac-main');
    });

    it('fails asset creation when facility does not exist or does not belong to tenant', async () => {
      const command = new CreateFixedAssetCommand({
        name: 'Unauthorized Cross-Tenant Asset',
        assetTag: 'AST-FAIL-01',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: new Date('2026-01-15'),
        purchaseValue: { amount: 1500, currency: 'USD' },
        location: {
          facilityId: 'fac-alien-999',
          roomId: 'room-1',
        },
        tenantId: 'tenant-kinergy-main',
        actorId: 'usr-admin-01',
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.error).toContain("Target facility 'fac-alien-999' does not exist");
    });
  });

  describe('TransferFixedAssetLocationHandler with Facility Catalog', () => {
    it('allows location transfer when destination facility belongs to tenant', async () => {
      // First create asset
      const createCommand = new CreateFixedAssetCommand({
        name: 'Ultrasound Scanner',
        assetTag: 'AST-SCAN-01',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-15'),
        purchaseValue: { amount: 3000, currency: 'USD' },
        location: { facilityId: 'fac-main' },
        tenantId: 'tenant-kinergy-main',
        actorId: 'usr-admin-01',
      });
      const created = await createHandler.execute(createCommand);
      expect(created.isSuccess).toBe(true);
      const assetId = created.value!.id;

      // Transfer to fac-west (which belongs to tenant-kinergy-main)
      const transferCommand = new TransferFixedAssetLocationCommand({
        id: assetId,
        location: {
          facilityId: 'fac-west',
          roomId: 'room-west-cardio-01',
        },
        actorId: 'staff-admin',
        tenantId: 'tenant-kinergy-main',
      });
      const transferResult = await transferHandler.execute(transferCommand);

      expect(transferResult.isSuccess).toBe(true);
      expect(transferResult.value?.location.facilityId).toBe('fac-west');
    });

    it('rejects location transfer to an unauthenticated/cross-tenant facility', async () => {
      // Create asset
      const createCommand = new CreateFixedAssetCommand({
        name: 'Ultrasound Scanner 2',
        assetTag: 'AST-SCAN-02',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2026-01-15'),
        purchaseValue: { amount: 3000, currency: 'USD' },
        location: { facilityId: 'fac-main' },
        tenantId: 'tenant-kinergy-main',
        actorId: 'usr-admin-01',
      });
      const created = await createHandler.execute(createCommand);
      const assetId = created.value!.id;

      // Transfer to invalid facility
      const transferCommand = new TransferFixedAssetLocationCommand({
        id: assetId,
        location: {
          facilityId: 'fac-unauthorized',
        },
        actorId: 'staff-admin',
        tenantId: 'tenant-kinergy-main',
      });
      const transferResult = await transferHandler.execute(transferCommand);

      expect(transferResult.isSuccess).toBe(false);
      expect(transferResult.error).toContain("Target facility 'fac-unauthorized' does not exist");
    });
  });
});

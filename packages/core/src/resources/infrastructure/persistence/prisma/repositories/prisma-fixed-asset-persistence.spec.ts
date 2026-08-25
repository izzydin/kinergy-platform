import { FixedAsset } from '../../../../domain/assets/fixed-asset.aggregate';
import { AssetId } from '../../../../domain/assets/value-objects/asset-id.vo';
import { AssetLocation } from '../../../../domain/assets/value-objects/asset-location.vo';
import { AssetCategory } from '../../../../domain/assets/enums/asset-category.enum';
import { AssetStatus } from '../../../../domain/assets/enums/asset-status.enum';
import { AssetCondition } from '../../../../domain/assets/enums/asset-condition.enum';
import { Money } from '../../../../domain/inventory/value-objects/money.vo';
import { PrismaFixedAssetMapper } from '../mappers/prisma-fixed-asset.mapper';
import { PrismaAssetHistoryEventMapper } from '../mappers/prisma-asset-history-event.mapper';
import { PrismaAssetMaintenanceRecordMapper } from '../mappers/prisma-asset-maintenance-record.mapper';

describe('PrismaFixedAsset Persistence Mappers', () => {
  const actorId = 'usr_tech_lead_01';
  const location = AssetLocation.create({
    facilityId: 'fac_main_01',
    roomId: 'room_rehab_01',
    zone: 'Zone B',
    description: 'Laser Treatment Bay',
  });

  it('maps a domain FixedAsset to Prisma persistence model and back with 100% fidelity', () => {
    const asset = FixedAsset.create(
      {
        id: AssetId.create('a0000000-0000-4000-a000-000000000001'),
        tenantId: 'tenant_kinergy_01',
        assetTag: 'AST-LSR-001',
        name: 'Class IV Therapeutic Laser',
        description: 'Deep tissue rehabilitation unit',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseDate: new Date('2024-03-15T00:00:00Z'),
        purchaseValue: Money.create(12500, 'USD'),
        location,
        condition: AssetCondition.EXCELLENT,
        status: AssetStatus.ACTIVE,
        notes: 'Annual calibration required',
      },
      actorId,
    );

    // Add a maintenance record
    asset.recordMaintenance(
      {
        serviceDate: new Date('2024-09-15T10:00:00Z'),
        description: '6-month optical sensor inspection and power calibration',
        cost: Money.create(350, 'USD'),
        performedBy: 'MedTech Certified LLC',
        notes: 'All sensors within ±1% tolerance',
        updateConditionTo: AssetCondition.EXCELLENT,
      },
      actorId,
    );

    // Map to persistence
    const persistenceData = PrismaFixedAssetMapper.toPersistence(asset);
    expect(persistenceData.id).toBe('a0000000-0000-4000-a000-000000000001');
    expect(persistenceData.tenantId).toBe('tenant_kinergy_01');
    expect(persistenceData.assetTag).toBe('AST-LSR-001');
    expect(persistenceData.name).toBe('Class IV Therapeutic Laser');
    expect(Number(persistenceData.purchaseValueAmount)).toBe(12500);
    expect(persistenceData.version).toBe(2);

    const historyPersistence = asset.historyEvents.map(PrismaAssetHistoryEventMapper.toPersistence);
    expect(historyPersistence).toHaveLength(2);

    const maintenancePersistence = asset.maintenanceRecords.map(
      PrismaAssetMaintenanceRecordMapper.toPersistence,
    );
    expect(maintenancePersistence).toHaveLength(1);
    expect(Number(maintenancePersistence[0]!.costAmount)).toBe(350);

    // Reconstitute back to domain
    const reconstituted = PrismaFixedAssetMapper.toDomain({
      ...persistenceData,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      historyEvents: historyPersistence,
      maintenanceRecords: maintenancePersistence.map((m) => ({
        ...m,
        createdAt: new Date(),
      })),
    });

    expect(reconstituted.id.value).toBe(asset.id.value);
    expect(reconstituted.assetTag).toBe(asset.assetTag);
    expect(reconstituted.name).toBe(asset.name);
    expect(reconstituted.category).toBe(AssetCategory.THERAPY_EQUIPMENT);
    expect(reconstituted.purchaseValue.amount).toBe(12500);
    expect(reconstituted.location.facilityId).toBe('fac_main_01');
    expect(reconstituted.location.roomId).toBe('room_rehab_01');
    expect(reconstituted.version).toBe(2);
    expect(reconstituted.historyEvents).toHaveLength(2);
    expect(reconstituted.maintenanceRecords).toHaveLength(1);
  });
});

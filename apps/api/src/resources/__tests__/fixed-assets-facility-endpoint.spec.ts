import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import {
  DefaultTenantFacilityCatalogService,
  ListFixedAssetsHandler,
  CreateFixedAssetHandler,
  UpdateFixedAssetDetailsHandler,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationHandler,
  GetFixedAssetByIdHandler,
  GetFixedAssetByTagHandler,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryHandler,
  GetAssetValueHandler,
  GetFixedAssetValuationSummaryHandler,
  ResourcesApplicationResult,
} from '@kinergy-platform/core';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { ListFixedAssetsQueryDto } from '../dto';

describe('FixedAssetsController Facility Context & Endpoints', () => {
  let controller: FixedAssetsController;
  let listHandler: jest.Mocked<ListFixedAssetsHandler>;
  let facilityCatalog: DefaultTenantFacilityCatalogService;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_admin_01',
    email: 'admin@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['assets.read', 'assets.write'],
    tenantId: 'tenant-kinergy-main',
  });

  const dummyHandler = {
    execute: jest.fn(),
  };

  beforeEach(() => {
    listHandler = {
      execute: jest.fn().mockResolvedValue(
        ResourcesApplicationResult.ok({
          items: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        }),
      ),
    } as unknown as jest.Mocked<ListFixedAssetsHandler>;

    facilityCatalog = new DefaultTenantFacilityCatalogService();

    controller = new FixedAssetsController(
      dummyHandler as unknown as CreateFixedAssetHandler,
      dummyHandler as unknown as UpdateFixedAssetDetailsHandler,
      dummyHandler as unknown as TransferFixedAssetLocationHandler,
      dummyHandler as unknown as ChangeFixedAssetStatusHandler,
      dummyHandler as unknown as UpdateFixedAssetConditionHandler,
      dummyHandler as unknown as RecordAssetMaintenanceHandler,
      dummyHandler as unknown as UpdateFixedAssetValuationHandler,
      dummyHandler as unknown as GetFixedAssetByIdHandler,
      dummyHandler as unknown as GetFixedAssetByTagHandler,
      listHandler,
      dummyHandler as unknown as GetAssetHistoryHandler,
      dummyHandler as unknown as GetMaintenanceHistoryHandler,
      dummyHandler as unknown as GetAssetValueHandler,
      dummyHandler as unknown as GetFixedAssetValuationSummaryHandler,
      facilityCatalog,
    );
  });

  describe('GET /resources/assets/facilities', () => {
    it('returns tenant-scoped facility options with room catalogs', async () => {
      const facilities = await controller.getFacilities(mockUser);

      expect(Array.isArray(facilities)).toBe(true);
      expect(facilities.length).toBeGreaterThan(0);

      const mainFacility = facilities.find((f) => f.id === 'fac-main');
      expect(mainFacility).toBeDefined();
      expect(mainFacility?.name).toBe('Main Facility - Central Campus');
      expect(mainFacility?.code).toBe('FAC-MAIN');
      expect(mainFacility?.tenantId).toBe('tenant-kinergy-main');
      expect(Array.isArray(mainFacility?.rooms)).toBe(true);
      expect(mainFacility?.rooms?.length).toBeGreaterThan(0);
    });

    it('returns empty array when user tenant has no registered facilities', async () => {
      const unknownTenantUser = new AuthenticatedUserContext({
        userId: 'usr_unknown',
        email: 'user@other.com',
        status: 'ACTIVE',
        roles: ['STAFF'],
        permissions: ['assets.read'],
        tenantId: 'tenant-nonexistent',
      });

      const facilities = await controller.getFacilities(unknownTenantUser);
      expect(facilities).toEqual([]);
    });

    it('falls back to default catalog service if not injected', async () => {
      const bareController = new FixedAssetsController(
        dummyHandler as unknown as CreateFixedAssetHandler,
        dummyHandler as unknown as UpdateFixedAssetDetailsHandler,
        dummyHandler as unknown as TransferFixedAssetLocationHandler,
        dummyHandler as unknown as ChangeFixedAssetStatusHandler,
        dummyHandler as unknown as UpdateFixedAssetConditionHandler,
        dummyHandler as unknown as RecordAssetMaintenanceHandler,
        dummyHandler as unknown as UpdateFixedAssetValuationHandler,
        dummyHandler as unknown as GetFixedAssetByIdHandler,
        dummyHandler as unknown as GetFixedAssetByTagHandler,
        listHandler,
        dummyHandler as unknown as GetAssetHistoryHandler,
        dummyHandler as unknown as GetMaintenanceHistoryHandler,
        dummyHandler as unknown as GetAssetValueHandler,
        dummyHandler as unknown as GetFixedAssetValuationSummaryHandler,
      );

      const facilities = await bareController.getFacilities(mockUser);
      expect(facilities.length).toBeGreaterThan(0);
      expect(facilities[0]?.id).toBe('fac-main');
      expect(facilities[0]?.tenantId).toBe('tenant-kinergy-main');
    });
  });

  describe('GET /resources/assets with facility context', () => {
    it('passes facilityId query parameter to list handler when provided', async () => {
      const query: ListFixedAssetsQueryDto = {
        page: 1,
        limit: 10,
        facilityId: 'fac-main',
      };

      await controller.listAssets(query, mockUser);

      expect(listHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              facilityId: 'fac-main',
            }),
            tenantId: 'tenant-kinergy-main',
          }),
        }),
      );
    });

    it('allows query without facilityId and executes listing across accessible facilities', async () => {
      const query: ListFixedAssetsQueryDto = {
        page: 1,
        limit: 10,
      };

      await controller.listAssets(query, mockUser);

      expect(listHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            filter: expect.objectContaining({
              facilityId: undefined,
            }),
            tenantId: 'tenant-kinergy-main',
          }),
        }),
      );
    });
  });
});

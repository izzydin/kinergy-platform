import { BadRequestException } from '@nestjs/common';
import {
  GetResourceOverviewHandler,
  GetResourceOverviewQuery,
  ResourcesApplicationResult,
  ResourceOverviewDTO,
} from '@kinergy-platform/core';
import { ResourceOverviewController } from '../controllers/resource-overview.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';

describe('ResourceOverviewController HTTP Contracts', () => {
  let controller: ResourceOverviewController;
  let mockHandler: jest.Mocked<GetResourceOverviewHandler>;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_exec_01',
    email: 'cfo@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['inventory.read', 'assets.read', 'billing.read'],
    tenantId: 'tenant_main',
  });

  const mockOverviewDTO: ResourceOverviewDTO = {
    consumableInventory: {
      totalValueAmount: 38450.0,
      lowStockItemCount: 3,
      totalDistinctItems: 42,
      totalQuantityUnits: 1250,
    },
    fixedAssets: {
      totalCarryingValueAmount: 185000.0,
      activeAssetCount: 14,
      underMaintenanceAssetCount: 1,
      damagedAssetCount: 0,
      retiredAssetCount: 2,
      totalAssetCount: 17,
    },
    combined: {
      totalCombinedValueAmount: 223450.0,
    },
    currency: 'USD',
    calculatedAt: '2026-09-05T14:30:00.000Z',
  };

  beforeEach(() => {
    mockHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetResourceOverviewHandler>;

    controller = new ResourceOverviewController(mockHandler);
  });

  describe('GET /api/v1/resources/overview', () => {
    it('retrieves executive overview metrics and dispatches query to application handler', async () => {
      mockHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockOverviewDTO));

      const result = await controller.getOverview(mockUser);

      expect(result).toEqual(mockOverviewDTO);
      expect(mockHandler.execute).toHaveBeenCalledWith(expect.any(GetResourceOverviewQuery));
      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: false,
          }),
        }),
      );
    });

    it('correctly normalizes boolean query parameters (includeArchived from query DTO)', async () => {
      mockHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockOverviewDTO));

      await controller.getOverview(mockUser, { includeArchived: true });

      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: true,
          }),
        }),
      );
    });

    it('correctly normalizes boolean query parameters from string values (true and 1)', async () => {
      mockHandler.execute.mockResolvedValue(ResourcesApplicationResult.ok(mockOverviewDTO));

      await controller.getOverview(mockUser, undefined, 'true');
      expect(mockHandler.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: true,
          }),
        }),
      );

      await controller.getOverview(mockUser, undefined, '1');
      expect(mockHandler.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: true,
          }),
        }),
      );

      await controller.getOverview(mockUser, undefined, 'false');
      expect(mockHandler.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: false,
          }),
        }),
      );
    });

    it('handles missing user tenant context gracefully', async () => {
      mockHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockOverviewDTO));

      const unassignedUser = new AuthenticatedUserContext({
        userId: 'usr_unassigned',
        email: 'anon@kinergy.platform',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['inventory.read', 'assets.read', 'billing.read'],
      });

      await controller.getOverview(unassignedUser);

      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: undefined,
            includeArchived: false,
          }),
        }),
      );
    });

    it('propagates domain failure as BadRequestException', async () => {
      mockHandler.execute.mockResolvedValueOnce(
        ResourcesApplicationResult.fail('Failed to compute resource overview telemetry.'),
      );

      await expect(controller.getOverview(mockUser)).rejects.toThrow(
        new BadRequestException('Failed to compute resource overview telemetry.'),
      );
    });
  });
});

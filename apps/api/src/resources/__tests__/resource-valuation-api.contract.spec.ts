import { BadRequestException } from '@nestjs/common';
import {
  GetCombinedResourceValuationHandler,
  GetCombinedResourceValuationQuery,
  ResourcesApplicationResult,
  ResourceValuationSummaryDTO,
} from '@kinergy-platform/core';
import { ResourceValuationController } from '../controllers/resource-valuation.controller';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';

describe('ResourceValuationController HTTP Contracts (Milestone 6.9)', () => {
  let controller: ResourceValuationController;
  let mockHandler: jest.Mocked<GetCombinedResourceValuationHandler>;

  const mockUser = new AuthenticatedUserContext({
    userId: 'usr_admin_cfo',
    email: 'cfo@kinergy.platform',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['inventory.read', 'assets.read', 'billing.read'],
    tenantId: 'tenant_main',
  });

  const mockSummaryDTO: ResourceValuationSummaryDTO = {
    totalCombinedValueAmount: 223450.0,
    totalCombinedPurchaseValueAmount: 265000.0,
    currency: 'USD',
    inventory: {
      totalValueAmount: 38450.0,
      totalDistinctItems: 42,
      totalQuantityUnits: 1250,
      sharePercentage: 17.21,
    },
    fixedAssets: {
      totalCarryingValueAmount: 185000.0,
      totalPurchaseValueAmount: 220000.0,
      totalAssetCount: 15,
      activeAssetCount: 14,
      sharePercentage: 82.79,
    },
    calculatedAt: '2026-08-31T15:00:00.000Z',
  };

  beforeEach(() => {
    mockHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCombinedResourceValuationHandler>;

    controller = new ResourceValuationController(mockHandler);
  });

  describe('GET /api/v1/resources/valuation/summary', () => {
    it('retrieves combined balance sheet summary and dispatches query to application handler', async () => {
      mockHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockSummaryDTO));

      const result = await controller.getCombinedSummary(mockUser, 'false', 'false');

      expect(result).toEqual(mockSummaryDTO);
      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.any(GetCombinedResourceValuationQuery),
      );
      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: false,
            includeDecommissioned: false,
          }),
        }),
      );
    });

    it('correctly normalizes boolean query parameters (includeArchived=true, includeDecommissioned=1)', async () => {
      mockHandler.execute.mockResolvedValueOnce(ResourcesApplicationResult.ok(mockSummaryDTO));

      await controller.getCombinedSummary(mockUser, 'true', '1');

      expect(mockHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            tenantId: 'tenant_main',
            includeArchived: true,
            includeDecommissioned: true,
          }),
        }),
      );
    });

    it('propagates domain failure as BadRequestException', async () => {
      mockHandler.execute.mockResolvedValue(
        ResourcesApplicationResult.fail('Failed to compute inventory working capital.'),
      );

      await expect(controller.getCombinedSummary(mockUser)).rejects.toThrow(
        new BadRequestException('Failed to compute inventory working capital.'),
      );
    });
  });
});

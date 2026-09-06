import { httpClient } from '../../../../shared/api/http-client';
import { resourceOverviewApi, resourceOverviewQueryKeys } from '../api';
import type { ResourceOverviewVM } from '../types';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

describe('Resource Overview API & Query Key Factory', () => {
  const mockOverviewResponse: ResourceOverviewVM = {
    consumableInventory: {
      totalValueAmount: 45000,
      lowStockItemCount: 2,
      totalDistinctItems: 14,
      totalQuantityUnits: 1250,
    },
    fixedAssets: {
      totalCarryingValueAmount: 120000,
      activeAssetCount: 8,
      underMaintenanceAssetCount: 1,
      damagedAssetCount: 0,
      retiredAssetCount: 2,
      totalAssetCount: 11,
    },
    combined: {
      totalCombinedValueAmount: 165000,
    },
    currency: 'USD',
    calculatedAt: '2026-09-06T12:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resourceOverviewQueryKeys', () => {
    it('produces hierarchical query keys', () => {
      expect(resourceOverviewQueryKeys.all).toEqual(['resources', 'overview']);
      expect(resourceOverviewQueryKeys.dashboard()).toEqual([
        'resources',
        'overview',
        'dashboard',
        {},
      ]);
      expect(resourceOverviewQueryKeys.dashboard({ includeArchived: true })).toEqual([
        'resources',
        'overview',
        'dashboard',
        { includeArchived: true },
      ]);
    });
  });

  describe('resourceOverviewApi.getOverview', () => {
    it('fetches resource overview without parameters', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce(mockOverviewResponse);

      const result = await resourceOverviewApi.getOverview();

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/resources/overview', {
        params: {},
      });
      expect(result).toEqual(mockOverviewResponse);
    });

    it('fetches resource overview with includeArchived parameter', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce(mockOverviewResponse);

      const result = await resourceOverviewApi.getOverview({ includeArchived: true });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/resources/overview', {
        params: { includeArchived: true },
      });
      expect(result).toEqual(mockOverviewResponse);
    });
  });
});

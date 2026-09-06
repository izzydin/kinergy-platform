import { httpClient } from '../../../../shared/api/http-client';
import type { ResourceOverviewVM, GetResourceOverviewParams } from '../types';

/**
 * Authoritative HTTP API Client for Resource Overview Dashboard
 * Consumes NestJS ResourceOverviewController (/api/v1/resources/overview)
 */
export const resourceOverviewApi = {
  /**
   * Retrieves synthesized executive metrics combining consumable inventory working capital
   * and operational counts with fixed asset carrying values and lifecycle telemetry (ADR-0094).
   *
   * Composed Permissions Required: inventory.read, assets.read, and billing.read
   */
  async getOverview(params?: GetResourceOverviewParams): Promise<ResourceOverviewVM> {
    const cleanParams: Record<string, boolean | undefined> = {};
    if (params?.includeArchived !== undefined) {
      cleanParams.includeArchived = params.includeArchived;
    }

    return httpClient.get<ResourceOverviewVM>('/api/v1/resources/overview', {
      params: cleanParams,
    });
  },
};

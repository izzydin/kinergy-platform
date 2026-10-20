import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../app/providers/auth-provider';
import { attendanceApi } from '../../attendance/api/attendance-api';
import { inventoryApi } from '../../resources/inventory/api/inventory-api';
import type { InventoryProductVM } from '../../resources/inventory/types';

export interface GymCheckInsSummary {
  readonly totalCheckIns: number;
  readonly grantedCount: number;
  readonly deniedCount: number;
  readonly uniqueClientsCount: number;
}

export interface LowStockAlertsSummary {
  readonly count: number;
  readonly outOfStockCount: number;
  readonly items: readonly InventoryProductVM[];
}

export const operationalDashboardKeys = {
  all: ['dashboard', 'operational'] as const,
  gymCheckIns: () => ['dashboard', 'operational', 'gym-checkins'] as const,
  lowStock: () => ['dashboard', 'operational', 'low-stock'] as const,
} as const;

/**
 * useTodayGymCheckIns — Authoritative operational query for today's facility gym check-ins.
 *
 * Endpoint: GET /api/v1/gym/attendance/today?limit=1
 * Date semantics: Authoritative facility-configured local business day (GymDay).
 * Permission: gym.attendance.read | attendance.read
 * Freshness: 30s staleTime.
 */
export function useTodayGymCheckIns(options?: { enabled?: boolean; retry?: boolean | number }) {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead =
    isAuthenticated && (hasPermission('gym.attendance.read') || hasPermission('attendance.read'));
  const isEnabled = options?.enabled !== undefined ? options.enabled && canRead : canRead;

  return useQuery<GymCheckInsSummary, Error>({
    queryKey: operationalDashboardKeys.gymCheckIns(),
    queryFn: async () => {
      const result = await attendanceApi.getTodayAttendance({ limit: 1 });
      const summary = result?.dailySummary;

      return {
        totalCheckIns: summary?.totalCheckIns ?? (result?.items?.length || 0),
        grantedCount: summary?.grantedCount ?? (result?.items?.length || 0),
        deniedCount: summary?.deniedCount ?? 0,
        uniqueClientsCount: summary?.uniqueClientsCount ?? (result?.items?.length || 0),
      };
    },
    enabled: isEnabled,
    staleTime: 30 * 1000,
    retry: options?.retry ?? (process.env.NODE_ENV === 'test' ? false : 1),
  });
}

/**
 * useLowStockAlerts — Authoritative operational query for inventory items at/below reorder threshold.
 *
 * Endpoint: GET /api/v1/resources/inventory/low-stock
 * Semantics: currentStock <= reorderThreshold invariant (excluding archived).
 * Permission: inventory.read
 * Freshness: 60s staleTime.
 */
export function useLowStockAlerts(options?: { enabled?: boolean; retry?: boolean | number }) {
  const { hasPermission, isAuthenticated } = useAuth();
  const canRead = isAuthenticated && hasPermission('inventory.read');
  const isEnabled = options?.enabled !== undefined ? options.enabled && canRead : canRead;

  return useQuery<LowStockAlertsSummary, Error>({
    queryKey: operationalDashboardKeys.lowStock(),
    queryFn: async () => {
      const items = await inventoryApi.getLowStock();
      const list = Array.isArray(items) ? items : [];

      return {
        count: list.length,
        outOfStockCount: list.filter((item) => item.isOutOfStock || item.currentStock === 0).length,
        items: list,
      };
    },
    enabled: isEnabled,
    staleTime: 60 * 1000,
    retry: options?.retry ?? (process.env.NODE_ENV === 'test' ? false : 1),
  });
}

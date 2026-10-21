/**
 * Dashboard Feature Module Types & View Models
 */

export interface DashboardMetricItem {
  readonly id: string;
  readonly title: string;
  readonly value: string;
  readonly change: string;
  readonly trend: 'up' | 'down' | 'neutral';
  readonly category: string;
}

export interface DashboardStatusSummary {
  readonly systemStatus: 'operational' | 'degraded' | 'maintenance';
  readonly activeServices: number;
  readonly totalServices: number;
  readonly lastUpdated: string;
}

/**
 * Activity item that supports optimistic bookmarking (A5.4 mutation demo)
 */
export interface DashboardActivity {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string;
  readonly type: 'info' | 'warning' | 'error' | 'success';
  readonly bookmarked: boolean;
}

/**
 * User profile ViewModel returned by /api/v1/auth/me (authoritative identity contract)
 */
export interface UserProfileViewModel {
  readonly id: string;
  readonly email: string;
  readonly status?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly tenantId?: string | null;
  readonly displayName: string;
  readonly role: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

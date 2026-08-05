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

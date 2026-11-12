import { moduleRegistry } from '../../app/routes/module-registry';
import { DashboardRouter } from './routes/dashboard.router';

// Register Dashboard Feature Module Contract with central router shell
moduleRegistry.register({
  id: 'dashboard',
  prefix: '/dashboard',
  title: 'Dashboard Overview',
  isProtected: true,
  component: DashboardRouter,
});

export { DashboardRouter };
export { DashboardOverviewPage } from './routes/dashboard-overview-page';
export { DashboardMetricsSection } from './components/dashboard-metrics-section';
export { DashboardTodaysSchedule } from './components/dashboard-todays-schedule';
export { DashboardNeedsAttention } from './components/dashboard-needs-attention';
export { DashboardQuickActions } from './components/dashboard-quick-actions';
export {
  GymCheckInsCard,
  LowStockAlertsCard,
  TodayAppointmentsCard,
  DailySalesTotalCard,
  OperationalMetricCards,
} from './components/operational-metric-cards';
export {
  useDashboardAccess,
  useTodayGymCheckIns,
  useLowStockAlerts,
  useTodayAppointments,
  useDailySalesTotal,
  usePendingSalesFollowUp,
  operationalDashboardKeys,
  getTodayOperationalBusinessDay,
  OPERATIONAL_FACILITY_TIMEZONE,
} from './api/operational-dashboard-queries';
export type {
  GymCheckInsSummary,
  LowStockAlertsSummary,
  TodayGymCheckInsMetric,
  LowStockAlertsMetric,
  TodayAppointmentsMetric,
  DailySalesTotalMetric,
  PendingSalesFollowUpMetric,
} from './api/operational-dashboard-queries';
export type { DashboardMetricItem, DashboardStatusSummary } from './types';

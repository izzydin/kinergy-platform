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
export {
  GymCheckInsCard,
  LowStockAlertsCard,
  TodayAppointmentsCard,
  DailySalesTotalCard,
} from './components/operational-metric-cards';
export {
  useTodayGymCheckIns,
  useLowStockAlerts,
  operationalDashboardKeys,
} from './api/operational-dashboard-queries';
export type {
  GymCheckInsSummary,
  LowStockAlertsSummary,
} from './api/operational-dashboard-queries';
export type { DashboardMetricItem, DashboardStatusSummary } from './types';

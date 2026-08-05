import { moduleRegistry } from '../../app/routes/module-registry';
import { DashboardRouter } from './dashboard.router';

// Register Dashboard Module Contract with central router shell
moduleRegistry.register({
  id: 'dashboard',
  prefix: '/dashboard',
  title: 'Dashboard Overview',
  isProtected: true,
  component: DashboardRouter,
});

export { DashboardRouter };
export { DashboardView } from './presentation/dashboard-view';

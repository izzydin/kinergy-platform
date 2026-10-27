import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { moduleRegistry } from '../../../../app/routes/module-registry';
import { navigationRegistry } from '../../../../app/navigation/navigation-registry';
import { NotFoundView } from '../../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';
import { RequirePermission } from '../../../../app/routes/permission-guard';

const TrainerDashboardPage = lazyWithRetry(() =>
  import('./trainer-dashboard-page').then((m) => ({ default: m.TrainerDashboardPage })),
);

export const TrainerDashboardSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Trainer Dashboard..." />}>
    <Routes>
      <Route
        index
        element={
          <RequirePermission permissions={['clients.read']}>
            <TrainerDashboardPage />
          </RequirePermission>
        }
      />
      <Route
        path="/"
        element={
          <RequirePermission permissions={['clients.read']}>
            <TrainerDashboardPage />
          </RequirePermission>
        }
      />
      <Route path="*" element={<NotFoundView message="Trainer dashboard view not found." />} />
    </Routes>
  </Suspense>
);

// Register Trainer Dashboard module with central app router shell
moduleRegistry.register({
  id: 'gym-trainer',
  prefix: '/gym/trainer-dashboard',
  title: 'Trainer Operations',
  isProtected: true,
  requiredPermissions: ['clients.read'],
  component: TrainerDashboardSubRouter,
});

// Register Trainer Dashboard Navigation Entry with central navigation registry
navigationRegistry.register({
  id: 'trainer-dashboard',
  label: 'Trainer Dashboard',
  path: '/gym/trainer-dashboard',
  icon: ClipboardList,
  order: 23,
  section: 'core',
  requiredPermissions: ['clients.read'],
});

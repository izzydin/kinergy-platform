import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../../app/routes/module-registry';
import { NotFoundView } from '../../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';

const TrainerDashboardPage = lazyWithRetry(() =>
  import('./trainer-dashboard-page').then((m) => ({ default: m.TrainerDashboardPage })),
);

export const TrainerDashboardSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Trainer Dashboard..." />}>
    <Routes>
      <Route path="/" element={<TrainerDashboardPage />} />
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

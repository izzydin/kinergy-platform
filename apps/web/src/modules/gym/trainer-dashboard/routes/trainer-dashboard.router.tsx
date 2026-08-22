import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { TrainerDashboardPage } from './trainer-dashboard-page';
import { moduleRegistry } from '../../../../app/routes/module-registry';
import { NotFoundView } from '../../../../app/routes/fallback-views';

export const TrainerDashboardSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<TrainerDashboardPage />} />
    <Route path="*" element={<NotFoundView message="Trainer dashboard view not found." />} />
  </Routes>
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

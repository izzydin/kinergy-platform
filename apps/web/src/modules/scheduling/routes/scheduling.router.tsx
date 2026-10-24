import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const CalendarPage = lazyWithRetry(() =>
  import('./calendar-page').then((m) => ({ default: m.CalendarPage })),
);

export const SchedulingSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Scheduling Calendar..." />}>
    <Routes>
      <Route path="/" element={<CalendarPage />} />
      <Route path="*" element={<NotFoundView message="Scheduling view not found." />} />
    </Routes>
  </Suspense>
);

// Register Scheduling module with central app router
moduleRegistry.register({
  id: 'scheduling',
  prefix: '/scheduling',
  title: 'Scheduling & Appointments Calendar',
  isProtected: true,
  requiredPermissions: ['appointments.read'],
  component: SchedulingSubRouter,
});

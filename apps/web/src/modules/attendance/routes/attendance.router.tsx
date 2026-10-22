import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const AttendanceReceptionPage = lazyWithRetry(() =>
  import('./attendance-reception-page').then((m) => ({ default: m.AttendanceReceptionPage })),
);

export const AttendanceSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Attendance Reception..." />}>
    <Routes>
      <Route path="/" element={<AttendanceReceptionPage />} />
      <Route path="*" element={<NotFoundView message="Attendance page not found." />} />
    </Routes>
  </Suspense>
);

// Register Attendance module with central app router
moduleRegistry.register({
  id: 'attendance',
  prefix: '/attendance',
  title: 'Gym Attendance & Admission',
  isProtected: true,
  requiredPermissions: ['gym.attendance.read'],
  component: AttendanceSubRouter,
});

import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const MembershipsSubRouter = lazyWithRetry(() =>
  import('../memberships/routes/memberships.router').then((m) => ({
    default: m.MembershipsSubRouter,
  })),
);
const PlansSubRouter = lazyWithRetry(() =>
  import('../plans/routes/plans.router').then((m) => ({
    default: m.PlansSubRouter,
  })),
);
const GymAttendanceSubRouter = lazyWithRetry(() =>
  import('../attendance/routes/attendance.router').then((m) => ({
    default: m.GymAttendanceSubRouter,
  })),
);
import { TrainerDashboardSubRouter } from '../trainer-dashboard/routes/trainer-dashboard.router';

export const GymManagementSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Gym Operations..." />}>
    <Routes>
      <Route index element={<Navigate to="memberships" replace />} />
      <Route path="/" element={<Navigate to="memberships" replace />} />
      <Route path="memberships" element={<MembershipsSubRouter />} />
      <Route path="memberships/*" element={<MembershipsSubRouter />} />
      <Route path="plans" element={<PlansSubRouter />} />
      <Route path="plans/*" element={<PlansSubRouter />} />
      <Route path="attendance" element={<GymAttendanceSubRouter />} />
      <Route path="attendance/*" element={<GymAttendanceSubRouter />} />
      <Route path="trainer-dashboard" element={<TrainerDashboardSubRouter />} />
      <Route path="trainer-dashboard/*" element={<TrainerDashboardSubRouter />} />
      <Route path="*" element={<NotFoundView message="Gym module view not found." />} />
    </Routes>
  </Suspense>
);

// Register Top-Level Gym Module Route Contract
moduleRegistry.register({
  id: 'gym',
  prefix: '/gym',
  title: 'Gym Operations & Memberships',
  isProtected: true,
  requiredPermissions: ['memberships.read'],
  component: GymManagementSubRouter,
});

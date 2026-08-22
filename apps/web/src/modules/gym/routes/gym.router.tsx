import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { MembershipsSubRouter } from '../memberships/routes/memberships.router';
import { PlansSubRouter } from '../plans/routes/plans.router';
import { GymAttendanceSubRouter } from '../attendance/routes/attendance.router';
import { TrainerDashboardSubRouter } from '../trainer-dashboard/routes/trainer-dashboard.router';

export const GymManagementSubRouter: React.FC = () => (
  <Routes>
    <Route path="memberships/*" element={<MembershipsSubRouter />} />
    <Route path="plans/*" element={<PlansSubRouter />} />
    <Route path="attendance/*" element={<GymAttendanceSubRouter />} />
    <Route path="trainer-dashboard/*" element={<TrainerDashboardSubRouter />} />
    <Route path="*" element={<NotFoundView message="Gym module view not found." />} />
  </Routes>
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

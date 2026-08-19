import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AttendanceReceptionPage } from './attendance-reception-page';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';

export const AttendanceSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<AttendanceReceptionPage />} />
    <Route path="*" element={<NotFoundView message="Attendance page not found." />} />
  </Routes>
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

import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundView } from '../../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';

const AttendancePage = lazyWithRetry(() =>
  import('./attendance-page').then((m) => ({ default: m.AttendancePage })),
);

export const GymAttendanceSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Gym Attendance..." />}>
    <Routes>
      <Route index element={<AttendancePage />} />
      <Route path="/" element={<AttendancePage />} />
      <Route path="*" element={<NotFoundView message="Attendance view not found." />} />
    </Routes>
  </Suspense>
);

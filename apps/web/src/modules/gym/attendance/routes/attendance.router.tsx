import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AttendancePage } from './attendance-page';
import { NotFoundView } from '../../../../app/routes/fallback-views';

export const GymAttendanceSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<AttendancePage />} />
    <Route path="*" element={<NotFoundView message="Attendance view not found." />} />
  </Routes>
);

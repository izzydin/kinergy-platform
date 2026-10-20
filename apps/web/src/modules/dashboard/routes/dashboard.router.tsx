import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { DashboardOverviewPage } from './dashboard-overview-page';

/**
 * Dashboard Sub-Router
 * Encapsulates module sub-routes (/dashboard) and specifies breadcrumb metadata.
 */
export const DashboardRouter: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<DashboardOverviewPage />}
        handle={{
          breadcrumb: 'Dashboard Overview',
        }}
      />
      <Route path="*" element={<NotFoundView message="Dashboard view not found." />} />
    </Routes>
  );
};

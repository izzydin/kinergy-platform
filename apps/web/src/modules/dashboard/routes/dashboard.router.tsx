import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { DashboardMetricsPage } from './dashboard-metrics-page';
import { DashboardOverviewPage } from './dashboard-overview-page';

/**
 * Dashboard Sub-Router
 * Encapsulates module sub-routes (/dashboard, /dashboard/metrics)
 * and specifies breadcrumb metadata.
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
      <Route
        path="metrics"
        element={<DashboardMetricsPage />}
        handle={{
          breadcrumb: 'Metrics & Performance',
        }}
      />
    </Routes>
  );
};

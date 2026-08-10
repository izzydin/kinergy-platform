import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { DashboardMetricsPage } from './dashboard-metrics-page';
import { DashboardOverviewPage } from './dashboard-overview-page';
import { DashboardUiStatesPage } from './dashboard-ui-states-page';

/**
 * Dashboard Sub-Router
 * Encapsulates module sub-routes (/dashboard, /dashboard/metrics, /dashboard/ui-states)
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
      <Route
        path="ui-states"
        element={<DashboardUiStatesPage />}
        handle={{
          breadcrumb: 'UI State Validation',
        }}
      />
    </Routes>
  );
};

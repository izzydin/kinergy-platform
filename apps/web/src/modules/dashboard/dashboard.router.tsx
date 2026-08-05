import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { DashboardMetricsView } from './presentation/dashboard-metrics-view';
import { DashboardView } from './presentation/dashboard-view';

/**
 * Dashboard Sub-Router
 *
 * Encapsulates module-specific sub-routes and specifies route handle metadata
 * for automatic breadcrumb generation.
 */
export const DashboardRouter: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<DashboardView />}
        handle={{
          breadcrumb: 'Dashboard Overview',
        }}
      />
      <Route
        path="metrics"
        element={<DashboardMetricsView />}
        handle={{
          breadcrumb: 'Metrics & Performance',
        }}
      />
    </Routes>
  );
};

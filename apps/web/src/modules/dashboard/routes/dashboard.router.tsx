import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const DashboardOverviewPage = lazyWithRetry(() =>
  import('./dashboard-overview-page').then((m) => ({ default: m.DashboardOverviewPage })),
);

/**
 * Dashboard Sub-Router
 * Encapsulates module sub-routes (/dashboard) and specifies breadcrumb metadata.
 */
export const DashboardRouter: React.FC = () => {
  return (
    <Suspense fallback={<SuspenseFallback label="Loading Dashboard Overview..." />}>
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
    </Suspense>
  );
};

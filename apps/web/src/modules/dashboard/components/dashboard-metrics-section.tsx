import React from 'react';
import { OperationalMetricCards } from './operational-metric-cards';

/**
 * Operational KPI summary cards section for the Kinergy main dashboard.
 * Each card manages its own query lifecycle, error recovery, and RBAC visibility.
 */
export const DashboardMetricsSection: React.FC = () => {
  return (
    <section aria-label="Operational Key Performance Indicators" className="w-full">
      <OperationalMetricCards />
    </section>
  );
};

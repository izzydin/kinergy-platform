import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundView } from '../../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';

const PlansListPage = lazyWithRetry(() =>
  import('./plans-list-page').then((m) => ({ default: m.PlansListPage })),
);
const PlanDetailPage = lazyWithRetry(() =>
  import('./plan-detail-page').then((m) => ({ default: m.PlanDetailPage })),
);

export const PlansSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Membership Plans..." />}>
    <Routes>
      <Route path="/" element={<PlansListPage />} />
      <Route path=":planId" element={<PlanDetailPage />} />
      <Route path="*" element={<NotFoundView message="Membership plan view not found." />} />
    </Routes>
  </Suspense>
);

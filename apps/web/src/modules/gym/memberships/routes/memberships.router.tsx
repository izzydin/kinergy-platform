import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundView } from '../../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';

const MembershipsListPage = lazyWithRetry(() =>
  import('./memberships-list-page').then((m) => ({ default: m.MembershipsListPage })),
);
const MembershipDetailPage = lazyWithRetry(() =>
  import('./membership-detail-page').then((m) => ({ default: m.MembershipDetailPage })),
);
const CreateMembershipPage = lazyWithRetry(() =>
  import('./create-membership-page').then((m) => ({ default: m.CreateMembershipPage })),
);

export const MembershipsSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Memberships..." />}>
    <Routes>
      <Route path="/" element={<MembershipsListPage />} />
      <Route path="new" element={<CreateMembershipPage />} />
      <Route path=":membershipId" element={<MembershipDetailPage />} />
      <Route path="*" element={<NotFoundView message="Membership view not found." />} />
    </Routes>
  </Suspense>
);

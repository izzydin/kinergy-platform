import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { MembershipsListPage } from './memberships-list-page';
import { MembershipDetailPage } from './membership-detail-page';
import { CreateMembershipPage } from './create-membership-page';
import { NotFoundView } from '../../../../app/routes/fallback-views';

export const MembershipsSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<MembershipsListPage />} />
    <Route path="new" element={<CreateMembershipPage />} />
    <Route path=":membershipId" element={<MembershipDetailPage />} />
    <Route path="*" element={<NotFoundView message="Membership view not found." />} />
  </Routes>
);

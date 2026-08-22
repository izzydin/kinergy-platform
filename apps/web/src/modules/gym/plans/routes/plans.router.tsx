import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { PlansListPage } from './plans-list-page';
import { PlanDetailPage } from './plan-detail-page';
import { NotFoundView } from '../../../../app/routes/fallback-views';

export const PlansSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<PlansListPage />} />
    <Route path=":planId" element={<PlanDetailPage />} />
    <Route path="*" element={<NotFoundView message="Membership plan view not found." />} />
  </Routes>
);

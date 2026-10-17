import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { RequirePermission } from '../../../app/routes/permission-guard';
import {
  SalesOverviewPage,
  SalesListPage,
  SaleCreatePage,
  SaleDetailPage,
  PaymentDetailPage,
  PaymentHistoryPage,
  ReceiptViewPage,
} from '../pages';

export const SalesSubRouter: React.FC = () => (
  <Routes>
    {/* 1. Sales Overview */}
    <Route
      index
      element={
        <RequirePermission permission="sales.read">
          <SalesOverviewPage />
        </RequirePermission>
      }
    />
    <Route
      path="overview"
      element={
        <RequirePermission permission="sales.read">
          <SalesOverviewPage />
        </RequirePermission>
      }
    />

    {/* 2. Sales Directory */}
    <Route
      path="list"
      element={
        <RequirePermission permission="sales.read">
          <SalesListPage />
        </RequirePermission>
      }
    />

    {/* 3. Create Sale Session */}
    <Route
      path="new"
      element={
        <RequirePermission permission="sales.create">
          <SaleCreatePage />
        </RequirePermission>
      }
    />

    {/* 4. Payment History Log */}
    <Route
      path="payments"
      element={
        <RequirePermission permission="payments.read">
          <PaymentHistoryPage />
        </RequirePermission>
      }
    />

    {/* 5. Payment Detail View */}
    <Route
      path="payments/:paymentId"
      element={
        <RequirePermission permission="payments.read">
          <PaymentDetailPage />
        </RequirePermission>
      }
    />

    {/* 6. Receipt Voucher View */}
    <Route
      path=":saleId/receipt"
      element={
        <RequirePermission permission="receipts.read">
          <ReceiptViewPage />
        </RequirePermission>
      }
    />

    {/* 7. Sale Detail Cockpit */}
    <Route
      path=":saleId"
      element={
        <RequirePermission permission="sales.read">
          <SaleDetailPage />
        </RequirePermission>
      }
    />

    <Route path="*" element={<NotFoundView message="Sales module view not found." />} />
  </Routes>
);

// Register Top-Level Sales & Payments Module Route Contract
moduleRegistry.register({
  id: 'sales',
  prefix: '/sales',
  title: 'Sales & Payments',
  isProtected: true,
  requiredPermissions: ['sales.read'],
  component: SalesSubRouter,
});

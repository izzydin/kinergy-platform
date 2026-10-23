import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// Import Feature Modules (registers module route contracts with moduleRegistry)
import '../../modules/dashboard';
import '../../modules/identity/user-management/routes/user-management-router';
import '../../modules/settings/routes/settings.router';
import '../../modules/attendance/routes/attendance.router';
import '../../modules/gym/routes/gym.router';
import '../../modules/sales/routes/sales.router';

import { AuthLayout, DashboardLayout } from '../layouts';
import {
  ForbiddenView,
  NotFoundView,
  PlaceholderView,
  UnauthenticatedView,
} from './fallback-views';
import { LazyView, SuspenseFallback, lazyWithRetry } from './lazy-loading';
import { moduleRegistry } from './module-registry';
import { RequirePermission } from './permission-guard';
import { ProtectedRoute } from './protected-route';
import { PublicRoute } from './public-route';
import { ErrorBoundary } from '../../shared/ui/error-boundary';

// ------------------------------------------------------------------------------
// Sub-Routers for Domain Modules (with Code-Splitting Boundaries)
// ------------------------------------------------------------------------------
const LoginRoute = lazyWithRetry(() =>
  import('../../modules/identity/authentication').then((m) => ({ default: m.LoginRoute })),
);

const AuthSubRouter: React.FC = () => (
  <React.Suspense fallback={<SuspenseFallback label="Loading Authentication..." />}>
    <Routes>
      <Route path="login" element={<LoginRoute />} />
      <Route
        path="reset-password"
        element={
          <PlaceholderView
            title="Password Reset View Placeholder"
            subtitle="Public Authentication Route Boundary (/auth/reset-password)"
          />
        }
      />
      <Route path="unauthorized" element={<ForbiddenView />} />
      <Route path="unauthenticated" element={<UnauthenticatedView />} />
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  </React.Suspense>
);

const ClientListPage = lazyWithRetry(() =>
  import('../../modules/client').then((m) => ({ default: m.ClientListPage })),
);
const ClientTimelinePage = lazyWithRetry(() =>
  import('../../modules/client').then((m) => ({ default: m.ClientTimelinePage })),
);
const ClientTreatmentHistoryPage = lazyWithRetry(() =>
  import('../../modules/kinesiology').then((m) => ({ default: m.ClientTreatmentHistoryPage })),
);

const ClientSubRouter: React.FC = () => (
  <React.Suspense fallback={<SuspenseFallback label="Loading Client Management..." />}>
    <Routes>
      <Route path="/" element={<ClientListPage />} />
      <Route
        path=":clientId"
        element={
          <PlaceholderView
            title="Client Detail View"
            subtitle="Client Module Sub-route Boundary (/clients/:clientId)"
          />
        }
      />
      <Route path=":clientId/timeline" element={<ClientTimelinePage />} />
      <Route path=":clientId/treatments" element={<ClientTreatmentHistoryPage />} />
      <Route path="*" element={<NotFoundView message="Client view not found." />} />
    </Routes>
  </React.Suspense>
);

const TreatmentSessionWorkspacePage = lazyWithRetry(() =>
  import('../../modules/kinesiology').then((m) => ({ default: m.TreatmentSessionWorkspacePage })),
);

const KinesiologySubRouter: React.FC = () => (
  <React.Suspense fallback={<SuspenseFallback label="Loading Kinesiology..." />}>
    <Routes>
      <Route path="sessions/:sessionId" element={<TreatmentSessionWorkspacePage />} />
      <Route path="clients/:clientId/history" element={<ClientTreatmentHistoryPage />} />
      <Route path="*" element={<NotFoundView message="Kinesiology view not found." />} />
    </Routes>
  </React.Suspense>
);

// Register Infrastructure Module Route Contracts
moduleRegistry.register({
  id: 'auth',
  prefix: '/auth',
  title: 'Identity & Authentication',
  isProtected: false,
  component: AuthSubRouter,
});

moduleRegistry.register({
  id: 'client',
  prefix: '/clients',
  title: 'Client Management',
  isProtected: true,
  requiredPermissions: ['client:read'],
  component: ClientSubRouter,
});

moduleRegistry.register({
  id: 'kinesiology',
  prefix: '/kinesiology',
  title: 'Kinesiology & Clinical Charting',
  isProtected: true,
  requiredPermissions: ['kinesiology.sessions.read'],
  component: KinesiologySubRouter,
});

const ResourceOverviewPage = lazyWithRetry(() =>
  import('../../modules/resources/overview').then((m) => ({ default: m.ResourceOverviewPage })),
);
const InventoryOverviewPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryOverviewPage })),
);
const InventoryListPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryListPage })),
);
const InventoryCreatePage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryCreatePage })),
);
const LowStockPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.LowStockPage })),
);
const InventoryDetailPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryDetailPage })),
);
const InventoryEditPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryEditPage })),
);
const InventoryMovementsPage = lazyWithRetry(() =>
  import('../../modules/resources/inventory').then((m) => ({ default: m.InventoryMovementsPage })),
);
const AssetOverviewPage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetOverviewPage })),
);
const AssetsListPage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetsListPage })),
);
const AssetCreatePage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetCreatePage })),
);
const AssetDetailPage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetDetailPage })),
);
const AssetEditPage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetEditPage })),
);
const AssetHistoryPage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetHistoryPage })),
);
const AssetMaintenancePage = lazyWithRetry(() =>
  import('../../modules/resources/assets').then((m) => ({ default: m.AssetMaintenancePage })),
);

const ResourcesSubRouter: React.FC = () => (
  <React.Suspense fallback={<SuspenseFallback label="Loading Resource View..." />}>
    <Routes>
      {/* Executive Resource Overview Dashboard (Milestone 6.14) */}
      <Route
        index
        element={
          <RequirePermission permissions={['inventory.read', 'assets.read']}>
            <ResourceOverviewPage />
          </RequirePermission>
        }
      />
      <Route
        path="overview"
        element={
          <RequirePermission permissions={['inventory.read', 'assets.read']}>
            <ResourceOverviewPage />
          </RequirePermission>
        }
      />

      {/* Consumable Inventory Routes */}
      <Route
        path="inventory/overview"
        element={
          <RequirePermission permission="inventory.read">
            <InventoryOverviewPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory"
        element={
          <RequirePermission permission="inventory.read">
            <InventoryListPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory/new"
        element={
          <RequirePermission permission="inventory.write">
            <InventoryCreatePage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory/low-stock"
        element={
          <RequirePermission permission="inventory.read">
            <LowStockPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory/:id"
        element={
          <RequirePermission permission="inventory.read">
            <InventoryDetailPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory/:id/edit"
        element={
          <RequirePermission permission="inventory.write">
            <InventoryEditPage />
          </RequirePermission>
        }
      />
      <Route
        path="inventory/:id/movements"
        element={
          <RequirePermission permission="inventory.read">
            <InventoryMovementsPage />
          </RequirePermission>
        }
      />

      {/* Fixed Capital Assets Routes */}
      <Route
        path="assets/overview"
        element={
          <RequirePermission permission="assets.read">
            <AssetOverviewPage />
          </RequirePermission>
        }
      />
      <Route
        path="assets"
        element={
          <RequirePermission permission="assets.read">
            <AssetsListPage />
          </RequirePermission>
        }
      />
      <Route
        path="assets/new"
        element={
          <RequirePermission permission="assets.write">
            <AssetCreatePage />
          </RequirePermission>
        }
      />
      <Route
        path="assets/:id"
        element={
          <RequirePermission permission="assets.read">
            <AssetDetailPage />
          </RequirePermission>
        }
      />
      <Route
        path="assets/:id/edit"
        element={
          <RequirePermission permission="assets.write">
            <AssetEditPage />
          </RequirePermission>
        }
      />
      <Route
        path="assets/:id/history"
        element={
          <RequirePermission permission="assets.read">
            <AssetHistoryPage />
          </RequirePermission>
        }
      />
      <Route
        path="assets/:id/maintenance"
        element={
          <RequirePermission permission="assets.read">
            <AssetMaintenancePage />
          </RequirePermission>
        }
      />

      <Route path="*" element={<NotFoundView message="Resource view not found." />} />
    </Routes>
  </React.Suspense>
);

moduleRegistry.register({
  id: 'resources',
  prefix: '/resources',
  title: 'Resources Management',
  isProtected: true,
  component: ResourcesSubRouter,
});

/**
 * Hybrid Feature Application Router Shell
 *
 * Top-level application router orchestrating top-level routing, layout wrapping,
 * public/protected security boundaries, lazy-loading suspense, catch-all 404 routes,
 * and dynamic module route delegation.
 */
export const AppRouter: React.FC = () => {
  const publicModules = moduleRegistry.getPublicModules();
  const protectedModules = moduleRegistry.getProtectedModules();

  return (
    <React.Suspense fallback={<SuspenseFallback label="Initializing Hybrid Router..." />}>
      <Routes>
        {/* 1. Public Authentication Routes (AuthLayout) */}
        <Route element={<PublicRoute />}>
          <Route element={<AuthLayout />}>
            {publicModules.map((module) => {
              const ModuleComponent = module.component;
              const pathPattern = `${module.prefix.replace(/^\//, '')}/*`;
              return (
                <Route
                  key={module.id}
                  path={pathPattern}
                  element={
                    <ErrorBoundary name={module.title}>
                      <LazyView fallbackLabel={`Loading ${module.title}...`}>
                        <ModuleComponent />
                      </LazyView>
                    </ErrorBoundary>
                  }
                />
              );
            })}
          </Route>
        </Route>

        {/* 2. Protected Application Routes (DashboardLayout / MainLayout) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            {/* Overview / Home Dashboard View */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Dynamic Protected Domain Feature Routes */}
            {protectedModules.map((module) => {
              const ModuleComponent = module.component;
              const pathPattern = `${module.prefix.replace(/^\//, '')}/*`;
              return (
                <Route
                  key={module.id}
                  path={pathPattern}
                  element={
                    <RequirePermission permissions={module.requiredPermissions}>
                      <ErrorBoundary name={module.title}>
                        <LazyView fallbackLabel={`Loading ${module.title}...`}>
                          <ModuleComponent />
                        </LazyView>
                      </ErrorBoundary>
                    </RequirePermission>
                  }
                />
              );
            })}
          </Route>
        </Route>

        {/* 3. Catch-all 404 View */}
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </React.Suspense>
  );
};

import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// Import Feature Modules (registers module route contracts with moduleRegistry)
import '../../modules/dashboard';
import '../../modules/identity/user-management';
import '../../modules/settings';
import '../../modules/attendance';

import { AuthLayout, DashboardLayout, MainLayout } from '../layouts';
import {
  ForbiddenView,
  NotFoundView,
  PlaceholderView,
  UnauthenticatedView,
} from './fallback-views';
import { LazyView, SuspenseFallback } from './lazy-loading';
import { moduleRegistry } from './module-registry';
import { RequirePermission } from './permission-guard';
import { ProtectedRoute } from './protected-route';
import { PublicRoute } from './public-route';

import { LoginRoute } from '../../modules/identity/authentication';

// ------------------------------------------------------------------------------
// Sub-Routers for Domain Modules
// ------------------------------------------------------------------------------
const AuthSubRouter: React.FC = () => (
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
);

import { ClientTimelinePage } from '../../modules/client';

const ClientSubRouter: React.FC = () => (
  <Routes>
    <Route
      path="/"
      element={
        <PlaceholderView
          title="Client Profiles Directory"
          subtitle="Client Module Route Boundary (/clients)"
        />
      }
    />
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
);

const EnergySubRouter: React.FC = () => (
  <Routes>
    <Route
      path="/"
      element={
        <PlaceholderView
          title="Energy Telemetry Monitoring"
          subtitle="Energy Module Route Boundary (/energy)"
        />
      }
    />
    <Route
      path="meters"
      element={
        <PlaceholderView
          title="Smart Meter Telemetry"
          subtitle="Energy Module Sub-route Boundary (/energy/meters)"
        />
      }
    />
    <Route path="*" element={<NotFoundView message="Energy view not found." />} />
  </Routes>
);

const AnalyticsSubRouter: React.FC = () => (
  <Routes>
    <Route
      path="/"
      element={
        <PlaceholderView
          title="Energy Analytics & Trends"
          subtitle="Analytics Module Route Boundary (/analytics)"
        />
      }
    />
    <Route path="*" element={<NotFoundView message="Analytics view not found." />} />
  </Routes>
);

import { ErrorBoundary } from '../../shared/ui/error-boundary';

import {
  TreatmentSessionWorkspacePage,
  ClientTreatmentHistoryPage,
} from '../../modules/kinesiology';

const KinesiologySubRouter: React.FC = () => (
  <Routes>
    <Route path="sessions/:sessionId" element={<TreatmentSessionWorkspacePage />} />
    <Route path="clients/:clientId/history" element={<ClientTreatmentHistoryPage />} />
    <Route path="*" element={<NotFoundView message="Kinesiology view not found." />} />
  </Routes>
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

moduleRegistry.register({
  id: 'energy',
  prefix: '/energy',
  title: 'Energy Telemetry',
  isProtected: true,
  requiredPermissions: ['energy:read'],
  component: EnergySubRouter,
});

moduleRegistry.register({
  id: 'analytics',
  prefix: '/analytics',
  title: 'Analytics & Reporting',
  isProtected: true,
  requiredPermissions: ['analytics:read'],
  component: AnalyticsSubRouter,
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

          {/* Alternative MainLayout Shell for Full-width Views */}
          <Route path="/shell" element={<MainLayout />}>
            <Route
              index
              element={
                <PlaceholderView
                  title="Full Width Main Layout Shell"
                  subtitle="Alternative Layout View Boundary (/shell)"
                />
              }
            />
          </Route>
        </Route>

        {/* 3. Catch-all 404 View */}
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </React.Suspense>
  );
};

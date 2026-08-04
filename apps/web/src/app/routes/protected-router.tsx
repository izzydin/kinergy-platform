import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '../layouts';
import { PlaceholderView } from './fallback-views';
import { LazyView } from './lazy-loading';
import { moduleRegistry } from './module-registry';
import { ProtectedRoute } from './protected-route';

/**
 * Protected Router Shell
 *
 * Enforces ProtectedRoute session and authorization boundaries, rendering protected
 * domain sub-routers inside the main DashboardLayout shell.
 */
export const ProtectedRouter: React.FC = () => {
  const protectedModules = moduleRegistry.getProtectedModules();

  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route
            path="/"
            element={
              <PlaceholderView
                title="Application Operational Dashboard"
                subtitle="Main Application Shell Boundary (/)"
              />
            }
          />
          {/* Dynamic Module Route Registration for Future Feature Modules */}
          {protectedModules.map((module) => {
            const ModuleComponent = module.component;
            const pathPattern = `${module.prefix.replace(/^\//, '')}/*`;
            return (
              <Route
                key={module.id}
                path={pathPattern}
                element={
                  <ProtectedRoute requiredPermissions={module.requiredPermissions}>
                    <LazyView fallbackLabel={`Loading ${module.title}...`}>
                      <ModuleComponent />
                    </LazyView>
                  </ProtectedRoute>
                }
              />
            );
          })}
        </Route>
      </Route>
    </Routes>
  );
};

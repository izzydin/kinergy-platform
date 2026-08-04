import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthLayout } from '../layouts';
import { ForbiddenView, PlaceholderView, UnauthenticatedView } from './fallback-views';
import { PublicRoute } from './public-route';

/**
 * Public Router Shell
 *
 * Enforces PublicRoute security boundaries and wraps unauthenticated authentication
 * workflows in the AuthLayout shell.
 */
export const PublicRouter: React.FC = () => {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route element={<AuthLayout />}>
          <Route
            path="login"
            element={
              <PlaceholderView
                title="Login View Boundary"
                subtitle="Public Authentication Route (/auth/login)"
              />
            }
          />
          <Route
            path="reset-password"
            element={
              <PlaceholderView
                title="Password Reset Boundary"
                subtitle="Public Password Recovery Route (/auth/reset-password)"
              />
            }
          />
          <Route path="unauthorized" element={<ForbiddenView />} />
          <Route path="unauthenticated" element={<UnauthenticatedView />} />
          <Route path="*" element={<Navigate to="login" replace />} />
        </Route>
      </Route>
    </Routes>
  );
};

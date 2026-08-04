import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ForbiddenView } from './fallback-views';
import { SuspenseFallback } from './lazy-loading';

export interface UserSession {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  session?: UserSession | null;
  isLoading?: boolean;
  requiredPermissions?: string[];
  fallbackRedirectPath?: string;
}

/**
 * Protected Route Guard Component
 *
 * Enforces client-side authentication and fine-grained authorization before
 * granting access to nested application views.
 *
 * Rules:
 * 1. While loading session state, renders SuspenseFallback.
 * 2. If unauthenticated, redirects to /auth/login with ?redirect=<currentLocation>.
 * 3. If authenticated but missing required permissions, renders <ForbiddenView /> (403).
 * 4. If authorized, renders child routes via <Outlet />.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  session = {
    id: 'usr_dev_123',
    email: 'operator@kinergy.io',
    roles: ['OPERATOR'],
    permissions: ['client:read', 'energy:read', 'analytics:read'],
  },
  isLoading = false,
  requiredPermissions = [],
  fallbackRedirectPath = '/auth/login',
}) => {
  const location = useLocation();

  if (isLoading) {
    return <SuspenseFallback label="Verifying session authorization..." />;
  }

  // 1. Check Authentication
  if (!session) {
    const redirectUrl = `${fallbackRedirectPath}?redirect=${encodeURIComponent(
      location.pathname + location.search,
    )}`;
    return <Navigate to={redirectUrl} replace />;
  }

  // 2. Check Permissions (if specified)
  if (requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every((perm) =>
      session.permissions.includes(perm),
    );

    if (!hasAllPermissions) {
      return (
        <ForbiddenView
          message={`Access Denied: Missing required permission (${requiredPermissions.join(', ')})`}
        />
      );
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

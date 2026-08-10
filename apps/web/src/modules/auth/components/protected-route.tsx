import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@kinergy-platform/ui';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { SuspenseFallback } from '../../../app/routes/lazy-loading';
import { useAuth } from '../../../app/providers/auth-provider';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  fallbackRedirectPath?: string;
}

/**
 * Production Protected Route Guard Component
 *
 * Enforces client-side authentication and fine-grained authorization based on the
 * canonical `AuthStatus` state machine.
 *
 * Behavior Matrix:
 * 1. BOOTSTRAPPING       → Renders loading indicator. DOES NOT REDIRECT to /auth/login.
 * 2. AUTHENTICATION_ERROR → Renders connection error recovery card with manual retry.
 * 3. UNAUTHENTICATED     → Redirects to /auth/login?redirect=<currentPath>.
 * 4. AUTHENTICATED       → Validates permissions/roles. Renders <ForbiddenView /> if missing,
 *                           otherwise renders child routes via <Outlet />.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  fallbackRedirectPath = '/auth/login',
}) => {
  const location = useLocation();
  const { status, session, retryBootstrap, hasPermission, hasRole } = useAuth();

  // 1. BOOTSTRAPPING: Wait for silent refresh & user profile recovery without redirecting
  if (status === 'BOOTSTRAPPING') {
    return <SuspenseFallback label="Verifying session authentication..." />;
  }

  // 2. AUTHENTICATION_ERROR: Render connection failure recovery option
  if (status === 'AUTHENTICATION_ERROR') {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Card className="max-w-md border-destructive/30 bg-card shadow-md">
          <CardHeader>
            <CardTitle className="text-destructive font-semibold text-lg">
              Authentication Gateway Connection Failure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Unable to connect to authentication server during session bootstrap. Your local
              credentials have been preserved. Please check your network connection and try again.
            </p>
            <Button size="sm" onClick={() => void retryBootstrap()}>
              Retry Connection
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. UNAUTHENTICATED: Redirect to login entry point
  if (status === 'UNAUTHENTICATED' || !session) {
    const redirectUrl = `${fallbackRedirectPath}?redirect=${encodeURIComponent(
      location.pathname + location.search,
    )}`;
    return <Navigate to={redirectUrl} replace />;
  }

  // 4. AUTHENTICATED: Validate Permissions & Roles
  if (requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every((perm) => hasPermission(perm));
    if (!hasAllPermissions) {
      return (
        <ForbiddenView
          message={`Access Denied: Missing required permission (${requiredPermissions.join(', ')})`}
        />
      );
    }
  }

  if (requiredRoles.length > 0) {
    const hasAllRoles = requiredRoles.every((role) => hasRole(role));
    if (!hasAllRoles) {
      return (
        <ForbiddenView
          message={`Access Denied: Missing required role (${requiredRoles.join(', ')})`}
        />
      );
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

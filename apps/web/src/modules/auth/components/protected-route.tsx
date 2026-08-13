import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@kinergy-platform/ui';
import { SuspenseFallback } from '../../../app/routes/lazy-loading';
import { useAuth } from '../../../app/providers/auth-provider';
import { createAuthRedirectUrl } from '../../../shared/auth/redirect-utils';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  fallbackRedirectPath?: string;
}

/**
 * Reusable Protected Route Guard Component
 *
 * Enforces client-side authentication based on the canonical `AuthStatus` state machine.
 * Answers exactly one question: "Can this route be rendered based on authentication state?"
 *
 * Behavior Matrix:
 * 1. BOOTSTRAPPING       → Renders loading indicator. DOES NOT REDIRECT to login.
 * 2. AUTHENTICATION_ERROR → Renders connection error recovery card with manual retry.
 * 3. UNAUTHENTICATED     → Redirects to /auth/login?redirect=<currentPath>.
 * 4. AUTHENTICATED       → Renders child routes via <Outlet /> or children.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackRedirectPath = '/auth/login',
}) => {
  const location = useLocation();
  const { status, currentUser, retryBootstrap } = useAuth();

  // 1. BOOTSTRAPPING: Wait for silent refresh & session recovery without redirecting
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
  if (status === 'UNAUTHENTICATED' || !currentUser) {
    const redirectUrl = createAuthRedirectUrl(location, fallbackRedirectPath);
    return <Navigate to={redirectUrl} replace />;
  }

  // 4. AUTHENTICATED: Grant route access
  return children ? <>{children}</> : <Outlet />;
};

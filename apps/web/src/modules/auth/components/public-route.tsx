import React from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { SuspenseFallback } from '../../../app/routes/lazy-loading';
import { useAuth } from '../../../app/providers/auth-provider';

export interface PublicRouteProps {
  children?: React.ReactNode;
  redirectIfAuthenticated?: boolean;
  defaultRedirectPath?: string;
}

/**
 * Public Route Guard Component
 *
 * Wraps public authentication routes (/auth/login, /auth/reset-password).
 * If user is already authenticated, redirects them away to default path or ?redirect target.
 */
export const PublicRoute: React.FC<PublicRouteProps> = ({
  children,
  redirectIfAuthenticated = true,
  defaultRedirectPath = '/dashboard',
}) => {
  const [searchParams] = useSearchParams();
  const { status, isAuthenticated } = useAuth();

  if (status === 'BOOTSTRAPPING') {
    return <SuspenseFallback label="Verifying session authentication..." />;
  }

  if (isAuthenticated && redirectIfAuthenticated) {
    const redirectParam = searchParams.get('redirect');
    let targetPath = redirectParam ? decodeURIComponent(redirectParam) : defaultRedirectPath;

    // Redirect loop prevention: Ensure authenticated users are never redirected back into an /auth route
    if (targetPath.startsWith('/auth')) {
      targetPath = defaultRedirectPath;
    }

    return <Navigate to={targetPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

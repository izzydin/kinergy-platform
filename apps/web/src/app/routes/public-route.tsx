import React from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import type { UserSession } from './protected-route';

export interface PublicRouteProps {
  session?: UserSession | null;
  redirectIfAuthenticated?: boolean;
  defaultRedirectPath?: string;
}

/**
 * Public Route Guard Component
 *
 * Wraps public routes accessible to unauthenticated visitors.
 * If user is already authenticated, optionally redirects them to default application path or ?redirect parameter.
 */
export const PublicRoute: React.FC<PublicRouteProps> = ({
  session = null,
  redirectIfAuthenticated = true,
  defaultRedirectPath = '/',
}) => {
  const [searchParams] = useSearchParams();

  if (session && redirectIfAuthenticated) {
    const redirectParam = searchParams.get('redirect');
    const targetPath = redirectParam ? decodeURIComponent(redirectParam) : defaultRedirectPath;
    return <Navigate to={targetPath} replace />;
  }

  return <Outlet />;
};

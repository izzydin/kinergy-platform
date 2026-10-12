import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../providers/auth-provider';
import type { AuthUser } from '../../modules/auth/domain/auth-state.types';
import { matchPermission } from '../../modules/auth/domain/permission-matcher';
import { ForbiddenView } from './fallback-views';

export interface HasPermissionProps {
  name: string;
  session?: AuthUser | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Declarative Permission Element Guard Component
 *
 * Renders child elements only if the authenticated session contains the required permission claim.
 * Aligns client-side component rendering with NestJS @RequirePermissions('client:write') backend decorators.
 */
export const HasPermission: React.FC<HasPermissionProps> = ({
  name,
  session: sessionProp,
  children,
  fallback = null,
}) => {
  let session = sessionProp;
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
    if (!session) {
      session = authContext.currentUser;
    }
  } catch {
    // If used outside AuthProvider boundary, fall back to explicit session prop
  }

  if (!session) {
    return <>{fallback}</>;
  }

  const isPermitted =
    typeof authContext?.hasPermission === 'function'
      ? authContext.hasPermission(name)
      : matchPermission(session.permissions, name);

  if (!isPermitted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export interface RequirePermissionProps {
  permission?: string;
  permissions?: string[];
  role?: string;
  roles?: string[];
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Authorization Guard Boundary Component (403 Forbidden Handling)
 *
 * Enforces authorization policies for authenticated users.
 * If user is authenticated but missing permission/role claims, renders <ForbiddenView /> (403 Access Denied).
 *
 * STRICT RULE: MUST NOT REDIRECT TO LOGIN.
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({
  permission,
  permissions = [],
  role,
  roles = [],
  children,
  fallback,
}) => {
  const auth = useAuth();
  const { currentUser, isAuthenticated } = auth;

  if (!isAuthenticated) {
    return null; // Authentication is handled by ProtectedRoute
  }

  const checkPermission =
    typeof auth.hasPermission === 'function'
      ? (p: string) => auth.hasPermission(p)
      : (p: string) => matchPermission(currentUser?.permissions, p);

  const checkRole =
    typeof auth.hasRole === 'function'
      ? (r: string) => auth.hasRole(r)
      : (r: string) => currentUser?.roles?.includes(r) ?? false;

  const allPermissions = permission ? [permission, ...permissions] : permissions;
  const allRoles = role ? [role, ...roles] : roles;

  const hasAllPermissions = allPermissions.every((p) => checkPermission(p));
  const hasAllRoles = allRoles.every((r) => checkRole(r));

  if (!hasAllPermissions || !hasAllRoles) {
    const missingPermissions = allPermissions.filter((p) => !checkPermission(p));
    const missingRoles = allRoles.filter((r) => !checkRole(r));
    const missingDetails = [...missingPermissions, ...missingRoles].join(', ');

    return (
      <>
        {fallback ?? (
          <ForbiddenView
            message={`Access Denied: Missing required security claim (${missingDetails || 'unauthorized'})`}
          />
        )}
      </>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

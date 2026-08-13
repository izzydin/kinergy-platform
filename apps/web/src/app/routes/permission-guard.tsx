import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../providers/auth-provider';
import type { AuthUser } from '../../modules/auth/domain/auth-state.types';
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
  try {
    const auth = useAuth();
    if (!session) {
      session = auth.currentUser;
    }
  } catch {
    // If used outside AuthProvider boundary, fall back to explicit session prop
  }

  if (!session || !session.permissions.includes(name)) {
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
  const { hasPermission, hasRole, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null; // Authentication is handled by ProtectedRoute
  }

  const allPermissions = permission ? [permission, ...permissions] : permissions;
  const allRoles = role ? [role, ...roles] : roles;

  const hasAllPermissions = allPermissions.every((p) => hasPermission(p));
  const hasAllRoles = allRoles.every((r) => hasRole(r));

  if (!hasAllPermissions || !hasAllRoles) {
    const missingPermissions = allPermissions.filter((p) => !hasPermission(p));
    const missingRoles = allRoles.filter((r) => !hasRole(r));
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

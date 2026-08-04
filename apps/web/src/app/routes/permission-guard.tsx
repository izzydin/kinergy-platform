import React from 'react';
import type { UserSession } from './protected-route';

export interface HasPermissionProps {
  name: string;
  session?: UserSession | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Declarative Permission Guard Component
 *
 * Renders child elements only if the authenticated session contains the required permission claim.
 * Aligns client-side component rendering with NestJS @RequirePermissions('client:write') backend decorators.
 */
export const HasPermission: React.FC<HasPermissionProps> = ({
  name,
  session = {
    id: 'usr_dev_123',
    email: 'operator@kinergy.io',
    roles: ['OPERATOR'],
    permissions: ['client:read', 'energy:read', 'analytics:read'],
  },
  children,
  fallback = null,
}) => {
  if (!session || !session.permissions.includes(name)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

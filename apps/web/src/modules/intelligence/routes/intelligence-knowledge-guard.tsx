import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../../app/providers/auth-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { ForbiddenView } from '../../../app/routes/fallback-views';

/**
 * Roles authorized to access Knowledge Center documents and ingestion management.
 * Conforms to ADR-AI-09-04 (Role-Based Intelligence Feature Gating).
 */
export const KNOWLEDGE_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'ENERGY_MANAGER'];

/**
 * Evaluates whether a given user holds the required roles to access the Knowledge Center.
 * Reusable authorization utility used by route guards and navigation visibility filters.
 */
export function canAccessKnowledgeCenter(
  user: AuthUser | null | undefined,
  hasRole?: (role: string) => boolean,
): boolean {
  if (typeof hasRole === 'function') {
    return KNOWLEDGE_ALLOWED_ROLES.some((role) => hasRole(role));
  }
  return user?.roles?.some((role) => KNOWLEDGE_ALLOWED_ROLES.includes(role)) ?? false;
}

export interface IntelligenceKnowledgeGuardProps {
  children?: React.ReactNode;
}

/**
 * Route-level authorization guard for Knowledge Center views.
 *
 * Enforces role-based access control:
 * - Allows: SUPER_ADMIN, ADMIN, OWNER, ENERGY_MANAGER.
 * - Denies: Non-administrative roles (e.g., OPERATOR, MEMBER, COLLABORATOR) with a 403 ForbiddenView.
 * - Invariant: Never redirects authenticated users to login on permission denial.
 */
export const IntelligenceKnowledgeGuard: React.FC<IntelligenceKnowledgeGuardProps> = ({
  children,
}) => {
  const { currentUser, hasRole } = useAuth();
  const isAuthorized = canAccessKnowledgeCenter(currentUser, hasRole);

  if (!isAuthorized) {
    return (
      <ForbiddenView message="Acceso denegado: Se requieren privilegios de administración o gestión de energía para acceder a la Base de Conocimiento." />
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

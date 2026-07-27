/**
 * Context structure supplied to authorization evaluation services.
 */
export interface AuthorizationContext {
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  requiredRoles?: string[];
  requiredPermissions?: string[];
  tenantId?: string | null;
}

/**
 * Resolver interface for fetching and expanding user permissions.
 * Supports future dynamic tenant policies, custom roles, or external PEP/PDP integrations.
 */
export interface IPermissionResolver {
  resolvePermissions(
    userId: string,
    userRoles: string[],
    directPermissions?: string[],
    tenantId?: string | null,
  ): Promise<string[]>;
}

export const PERMISSION_RESOLVER = Symbol('IPermissionResolver');

/**
 * Primary Authorization Evaluation Service Interface.
 * Evaluates whether an authenticated user satisfies role and permission requirements.
 */
export interface IAuthorizationService {
  isAuthorized(context: AuthorizationContext): Promise<boolean>;
}

export const AUTHORIZATION_SERVICE = Symbol('IAuthorizationService');

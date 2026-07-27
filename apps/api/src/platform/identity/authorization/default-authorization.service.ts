import { Injectable } from '@nestjs/common';
import { AuthorizationContext, IAuthorizationService } from './authorization.interface';

/**
 * Default implementation of IAuthorizationService.
 * Evaluates authorization rules based on role satisfaction AND permission satisfaction.
 * Supports wildcard permission pattern matching ('*', 'users:*').
 */
@Injectable()
export class DefaultAuthorizationService implements IAuthorizationService {
  async isAuthorized(context: AuthorizationContext): Promise<boolean> {
    const { userRoles, userPermissions, requiredRoles, requiredPermissions } = context;

    // Rule 1: Validate Role Requirements (if specified)
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(
        (role) => userRoles.includes(role) || userRoles.includes('ADMIN'),
      );
      if (!hasRequiredRole) {
        return false;
      }
    }

    // Rule 2: Validate Permission Requirements (if specified)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((requiredPerm) =>
        this.hasPermission(userPermissions, requiredPerm),
      );
      if (!hasAllPermissions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates if user permissions contain required permission, supporting wildcard patterns.
   */
  private hasPermission(userPermissions: string[], requiredPerm: string): boolean {
    if (userPermissions.includes('*') || userPermissions.includes(requiredPerm)) {
      return true;
    }

    return userPermissions.some((perm) => {
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -2);
        return requiredPerm.startsWith(prefix);
      }
      return false;
    });
  }
}

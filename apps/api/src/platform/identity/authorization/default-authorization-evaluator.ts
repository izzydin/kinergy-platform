import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { IAuthorizationEvaluator } from './authorization-evaluator.interface';
import { IPermissionResolver, PERMISSION_RESOLVER } from './authorization.interface';
import { AuthorizationDecision } from './models/authorization-decision.model';
import { AuthorizationRequirements } from './models/authorization-requirements.model';

/**
 * Default implementation of IAuthorizationEvaluator.
 * Single decision point for evaluating role and permission authorization policies.
 * Delegates permission resolution to IPermissionResolver abstraction.
 */
@Injectable()
export class DefaultAuthorizationEvaluator implements IAuthorizationEvaluator {
  constructor(
    @Inject(PERMISSION_RESOLVER)
    private readonly permissionResolver: IPermissionResolver,
  ) {}

  async evaluate(
    userContext: AuthenticatedUserContext,
    requirements: AuthorizationRequirements,
  ): Promise<AuthorizationDecision> {
    if (!requirements.hasRequirements()) {
      return AuthorizationDecision.authorized();
    }

    // 1. Role Satisfaction Check
    if (requirements.requiredRoles.length > 0) {
      const hasRole = requirements.requiredRoles.some((role) => userContext.hasRole(role));
      if (!hasRole) {
        return AuthorizationDecision.denied(
          `Access denied: required role missing. User roles: [${userContext.roles.join(', ')}]`,
          'ROLES',
          { requiredRoles: requirements.requiredRoles, userRoles: userContext.roles },
        );
      }
    }

    // 2. Permission Satisfaction Check
    if (requirements.requiredPermissions.length > 0) {
      const resolvedPermissions = await this.permissionResolver.resolvePermissions(
        userContext.userId,
        [...userContext.roles],
        [...userContext.permissions],
        userContext.tenantId,
      );

      const hasPermissions = requirements.requiredPermissions.every((requiredPerm) =>
        this.hasPermissionPattern(resolvedPermissions, requiredPerm),
      );

      if (!hasPermissions) {
        return AuthorizationDecision.denied(
          'Access denied: required permission missing.',
          'PERMISSIONS',
          { requiredPermissions: requirements.requiredPermissions, resolvedPermissions },
        );
      }
    }

    return AuthorizationDecision.authorized();
  }

  private hasPermissionPattern(resolvedPermissions: string[], requiredPerm: string): boolean {
    if (resolvedPermissions.includes('*') || resolvedPermissions.includes(requiredPerm)) {
      return true;
    }

    return resolvedPermissions.some((perm) => {
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -2);
        return requiredPerm.startsWith(prefix);
      }
      return false;
    });
  }
}

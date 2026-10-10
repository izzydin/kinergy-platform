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

    // 1. Principal Integrity Check (Fail-Closed)
    if (!userContext.userId || userContext.userId.trim() === '') {
      return AuthorizationDecision.denied(
        'Access denied: missing authenticated identity.',
        'IDENTITY',
      );
    }

    if (userContext.status && userContext.status !== 'ACTIVE') {
      return AuthorizationDecision.denied(
        'Access denied: user account is inactive or disabled.',
        'IDENTITY',
      );
    }

    // 2. Role Satisfaction Check
    if (requirements.requiredRoles.length > 0) {
      const hasRole = requirements.requiredRoles.some((role) => userContext.hasRole(role));
      if (!hasRole) {
        return AuthorizationDecision.denied('Access denied: required role missing.', 'ROLES', {
          requiredRoles: requirements.requiredRoles,
          userRoles: userContext.roles,
        });
      }
    }

    // 3. Permission Satisfaction Check
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
    const normalize = (p: string) => p.replace(/:/g, '.');
    const normRequired = normalize(requiredPerm);
    const normResolved = resolvedPermissions.map(normalize);

    if (
      resolvedPermissions.includes('*') ||
      resolvedPermissions.includes('*:*:*') ||
      normResolved.includes('*') ||
      normResolved.includes('*.*.*') ||
      normResolved.includes(normRequired)
    ) {
      return true;
    }

    // ADR-0111 / ADR-0135 Backward Compatibility Mappings:
    // billing.manage covers all billing, sales, payments, and receipts operations
    if (
      normResolved.includes('billing.manage') &&
      (normRequired.startsWith('sales.') ||
        normRequired.startsWith('payments.') ||
        normRequired.startsWith('receipts.') ||
        normRequired.startsWith('billing.'))
    ) {
      return true;
    }

    // billing.read implies sales.read, payments.read, receipts.read
    if (
      normResolved.includes('billing.read') &&
      ['sales.read', 'payments.read', 'receipts.read'].includes(normRequired)
    ) {
      return true;
    }

    // billing.write implies sales.create, payments.create
    if (
      normResolved.includes('billing.write') &&
      ['sales.create', 'payments.create'].includes(normRequired)
    ) {
      return true;
    }

    // sales.manage implies sales.create, sales.read, sales.cancel
    if (
      normResolved.includes('sales.manage') &&
      ['sales.create', 'sales.read', 'sales.cancel'].includes(normRequired)
    ) {
      return true;
    }

    // payments.manage implies payments.create and payments.read
    if (
      normResolved.includes('payments.manage') &&
      ['payments.create', 'payments.read'].includes(normRequired)
    ) {
      return true;
    }

    // receipts.manage implies receipts.read
    if (normResolved.includes('receipts.manage') && ['receipts.read'].includes(normRequired)) {
      return true;
    }

    return normResolved.some((perm) => {
      if (perm.endsWith('.*')) {
        const prefix = perm.slice(0, -2);
        return normRequired.startsWith(prefix);
      }
      return false;
    });
  }
}

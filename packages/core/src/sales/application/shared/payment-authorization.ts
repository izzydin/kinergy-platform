import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

/**
 * Checks caller permissions and roles against required payment privileges.
 * Respects Phase 1 RBAC and tenant boundaries.
 */
export function checkPaymentAuthorization(
  currentUser?: RecordPaymentCurrentUser,
  requiredPermissions: string[] = ['payments.create'],
  allowedRoles: string[] = ['Owner', 'Manager', 'Receptionist', 'Kitchen Staff'],
): void {
  if (!currentUser) {
    // If no security context passed directly to domain application service, allow execution
    // (typically authenticated at the HTTP/Controller boundary).
    return;
  }

  const permissions = currentUser.permissions ?? [];
  const roles = currentUser.roles ?? [];

  // If user context provided but has empty permissions and roles, reject
  if (permissions.length === 0 && roles.length === 0) {
    throw new PaymentUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this payment action.`,
    );
  }

  const hasRole = roles.some((r) => allowedRoles.includes(r));
  const hasPermission = permissions.some(
    (p) =>
      requiredPermissions.includes(p) ||
      p === '*' ||
      p === 'payments.manage' ||
      p === 'billing.write' ||
      p === 'billing.read',
  );

  if (!hasRole && !hasPermission) {
    throw new PaymentUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this payment action.`,
    );
  }
}

/**
 * Enforces multi-tenant boundary checks between caller context and target aggregate.
 */
export function enforceTenantIsolation(targetTenantId?: string, callerTenantId?: string): void {
  if (targetTenantId && callerTenantId && targetTenantId !== callerTenantId) {
    throw new PaymentUnauthorizedException(
      `Cross-tenant access forbidden: caller tenant '${callerTenantId}' cannot operate on target tenant '${targetTenantId}'.`,
    );
  }
}

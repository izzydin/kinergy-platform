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

  // 1. Role validation: if allowedRoles specified, user must possess at least one allowed role
  if (allowedRoles.length > 0 && roles.length > 0) {
    const hasRole = roles.some((r) => allowedRoles.includes(r) || r === 'Owner' || r === 'Manager');
    if (!hasRole) {
      throw new PaymentUnauthorizedException(
        `User roles [${roles.join(', ')}] are not authorized for this payment action.`,
      );
    }
  }

  // 2. Permission validation: must satisfy required permissions
  const hasPermission = permissions.some((p) => {
    if (p === '*' || p === '*:*:*' || p === 'payments.*') {
      return true;
    }
    if (requiredPermissions.includes(p)) {
      return true;
    }
    // payments.manage covers payments.create and payments.read
    if (p === 'payments.manage' && requiredPermissions.some((rp) => rp.startsWith('payments.'))) {
      return true;
    }
    // Backward compatibility:
    // billing.write covers payments.create
    if (p === 'billing.write' && requiredPermissions.includes('payments.create')) {
      return true;
    }
    // billing.read covers payments.read
    if (p === 'billing.read' && requiredPermissions.includes('payments.read')) {
      return true;
    }
    return false;
  });

  if (!hasPermission) {
    throw new PaymentUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this payment action.`,
    );
  }
}

/**
 * Enforces multi-tenant boundary checks between caller context and target aggregate.
 */
export function enforceTenantIsolation(targetTenantId?: string, callerTenantId?: string): void {
  if (!targetTenantId || !callerTenantId) {
    return;
  }

  if (targetTenantId.trim() !== callerTenantId.trim()) {
    throw new PaymentUnauthorizedException(
      `Cross-tenant access forbidden: caller tenant '${callerTenantId}' cannot operate on target tenant '${targetTenantId}'.`,
    );
  }
}

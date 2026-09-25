import { ReceiptUnauthorizedException } from '../exceptions/receipt-unauthorized.exception';

export interface ReceiptCurrentUser {
  readonly id?: string;
  readonly tenantId?: string;
  readonly roles?: string[];
  readonly permissions?: string[];
}

/**
 * Checks caller permissions and roles against required receipt privileges.
 * Respects Phase 1 RBAC and tenant boundaries.
 * Codified by ADR-0111 and ADR-0117.
 */
export function checkReceiptAuthorization(
  currentUser?: ReceiptCurrentUser,
  requiredPermissions: string[] = ['receipts.manage'],
  allowedRoles: string[] = [
    'Owner',
    'Gym Owner',
    'Manager',
    'Gym Manager',
    'Platform Admin',
    'Receptionist',
    'Kitchen Staff',
    'Client',
    'Member',
  ],
): void {
  if (!currentUser) {
    // If no security context passed directly to domain application service, allow execution
    // (authenticated at the HTTP/Controller boundary).
    return;
  }

  const permissions = currentUser.permissions ?? [];
  const roles = currentUser.roles ?? [];

  // If user context provided but has empty permissions and roles, reject
  if (permissions.length === 0 && roles.length === 0) {
    throw new ReceiptUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this receipt action.`,
    );
  }

  // 1. Role validation: if allowedRoles specified, user must possess at least one allowed role
  if (allowedRoles.length > 0 && roles.length > 0) {
    const hasRole = roles.some(
      (r) =>
        allowedRoles.includes(r) ||
        r.includes('Owner') ||
        r.includes('Manager') ||
        r === 'Platform Admin',
    );
    if (!hasRole) {
      throw new ReceiptUnauthorizedException(
        `User roles [${roles.join(', ')}] are not authorized for this receipt action.`,
      );
    }
  }

  // 2. Permission validation: must satisfy required permissions
  const hasPermission = permissions.some((p) => {
    if (p === '*' || p === '*:*:*' || p === 'receipts.*') {
      return true;
    }
    if (requiredPermissions.includes(p)) {
      return true;
    }
    // receipts.manage covers receipts.read
    if (p === 'receipts.manage' && requiredPermissions.includes('receipts.read')) {
      return true;
    }
    // Backward compatibility with billing/sales permissions
    if (p === 'billing.manage' || p === 'sales.manage') {
      return true;
    }
    if (p === 'billing.read' && requiredPermissions.includes('receipts.read')) {
      return true;
    }
    return false;
  });

  if (!hasPermission) {
    throw new ReceiptUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this receipt action.`,
    );
  }
}

/**
 * Enforces multi-tenant boundary checks between caller context and target aggregate.
 */
export function enforceReceiptTenantIsolation(
  targetTenantId?: string,
  callerTenantId?: string,
): void {
  if (!targetTenantId || !callerTenantId) {
    return;
  }

  if (targetTenantId.trim() !== callerTenantId.trim()) {
    throw new ReceiptUnauthorizedException(
      `Cross-tenant access forbidden: caller tenant '${callerTenantId}' cannot operate on target tenant '${targetTenantId}'.`,
    );
  }
}

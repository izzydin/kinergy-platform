import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

export interface PaymentCurrentUser {
  readonly id?: string;
  readonly userId?: string;
  readonly email?: string;
  readonly tenantId?: string | null;
  readonly roles?: string[];
  readonly permissions?: string[];
}

export const PAYMENT_MUTATION_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
  'Kitchen Staff',
];

export const PAYMENT_READ_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
  'Kitchen Staff',
  'Trainer',
  'Client',
  'Member',
];

/**
 * Checks caller permissions and roles against required payment privileges.
 * Respects Phase 1 RBAC, ADR-0111, and ADR-0135:
 * - Normalizes colon-notation (e.g. payments:read) and canonical dot-notation (payments.read).
 * - Implements capability hierarchy: payments.manage implies payments.create and payments.read.
 * - Supports backward-compatible billing aliases: billing.manage, billing.read, billing.write.
 * - Defaults role matrix appropriately based on read vs mutation privileges.
 */
export function checkPaymentAuthorization(
  currentUser?: PaymentCurrentUser | RecordPaymentCurrentUser,
  requiredPermissions: string[] = ['payments.create'],
  allowedRoles?: string[],
): void {
  if (!currentUser) {
    // If no security context passed directly to domain application service, allow execution
    // (typically authenticated and authorized at the HTTP/Controller boundary).
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

  const normalize = (p: string) => p.replace(/:/g, '.');
  const normRequired = requiredPermissions.map(normalize);
  const isReadOnly = normRequired.every((p) => p === 'payments.read');

  // Determine effective allowed roles if not explicitly supplied
  const effectiveAllowedRoles =
    allowedRoles ?? (isReadOnly ? PAYMENT_READ_ROLES : PAYMENT_MUTATION_ROLES);

  // 1. Role validation: if allowedRoles specified, user must possess at least one allowed role
  if (effectiveAllowedRoles.length > 0 && roles.length > 0) {
    const hasRole = roles.some(
      (r) =>
        effectiveAllowedRoles.includes(r) ||
        r.includes('Owner') ||
        r.includes('Manager') ||
        r === 'Platform Admin',
    );
    if (!hasRole) {
      throw new PaymentUnauthorizedException(
        `User roles [${roles.join(', ')}] are not authorized for this payment action.`,
      );
    }
  }

  // 2. Permission validation: must satisfy required permissions
  const normUserPerms = permissions.map(normalize);

  const hasPermission = normUserPerms.some((p) => {
    if (p === '*' || p === '*:*:*' || p === '*.*.*' || p === 'payments.*') {
      return true;
    }
    if (normRequired.includes(p)) {
      return true;
    }
    // payments.manage covers payments.create and payments.read
    if (p === 'payments.manage' && normRequired.some((rp) => rp.startsWith('payments.'))) {
      return true;
    }
    // Backward compatibility:
    // billing.manage covers all billing, sales, and payment operations
    if (p === 'billing.manage') {
      return true;
    }
    // billing.write covers payments.create
    if (p === 'billing.write' && normRequired.includes('payments.create')) {
      return true;
    }
    // billing.read covers payments.read
    if (p === 'billing.read' && normRequired.includes('payments.read')) {
      return true;
    }
    // Prefix wildcard pattern matching (e.g. billing.* or payments.*)
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -2);
      return normRequired.some((rp) => rp.startsWith(prefix));
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
export function enforceTenantIsolation(
  targetTenantId?: string | null,
  callerTenantId?: string | null,
): void {
  if (!targetTenantId || !callerTenantId) {
    return;
  }

  if (targetTenantId.trim() !== callerTenantId.trim()) {
    throw new PaymentUnauthorizedException(
      `Cross-tenant access forbidden: caller tenant '${callerTenantId}' cannot operate on target tenant '${targetTenantId}'.`,
    );
  }
}

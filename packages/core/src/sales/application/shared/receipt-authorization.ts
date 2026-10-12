import { Receipt } from '../../domain/receipt.aggregate';
import { ReceiptUnauthorizedException } from '../exceptions/receipt-unauthorized.exception';

export interface ReceiptCurrentUser {
  readonly id?: string;
  readonly userId?: string;
  readonly clientId?: string;
  readonly email?: string;
  readonly tenantId?: string | null;
  readonly roles?: string[];
  readonly permissions?: string[];
}

export const RECEIPT_MUTATION_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
  'Kitchen Staff',
];

export const RECEIPT_READ_ROLES: string[] = [
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
 * Checks caller permissions and roles against required receipt privileges.
 * Respects Phase 1 RBAC, ADR-0111, ADR-0117, and ADR-0135:
 * - Normalizes colon-notation (e.g. receipts:read) and canonical dot-notation (receipts.read).
 * - Implements capability hierarchy: receipts.manage covers receipts.read; billing.manage / sales.manage covers receipts.read.
 * - Supports backward-compatible billing aliases: billing.manage, billing.read.
 * - Defaults role matrix appropriately based on read vs mutation privileges.
 */
export function checkReceiptAuthorization(
  currentUser?: ReceiptCurrentUser,
  requiredPermissions: string[] = ['receipts.manage'],
  allowedRoles?: string[],
): void {
  if (!currentUser) {
    // If no security context passed directly to domain application service, allow execution
    // (authenticated and authorized at the HTTP/Controller boundary).
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

  const normalize = (p: string) => p.replace(/:/g, '.');
  const normRequired = requiredPermissions.map(normalize);
  const isReadOnly = normRequired.every((p) => p === 'receipts.read');

  // Determine effective allowed roles if not explicitly supplied
  const effectiveAllowedRoles =
    allowedRoles ?? (isReadOnly ? RECEIPT_READ_ROLES : RECEIPT_MUTATION_ROLES);

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
      throw new ReceiptUnauthorizedException(
        `User roles [${roles.join(', ')}] are not authorized for this receipt action.`,
      );
    }
  }

  // 2. Permission validation: must satisfy required permissions
  const normUserPerms = permissions.map(normalize);

  const hasPermission = normUserPerms.some((p) => {
    if (p === '*' || p === '*:*:*' || p === '*.*.*' || p === 'receipts.*') {
      return true;
    }
    if (normRequired.includes(p)) {
      return true;
    }
    // receipts.manage covers receipts.read
    if (p === 'receipts.manage' && normRequired.includes('receipts.read')) {
      return true;
    }
    // Backward compatibility with billing/sales permissions
    if (p === 'billing.manage') {
      return true;
    }
    if (p === 'sales.manage' && normRequired.includes('receipts.read')) {
      return true;
    }
    if (p === 'billing.read' && normRequired.includes('receipts.read')) {
      return true;
    }
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -2);
      return normRequired.some((rp) => rp.startsWith(prefix));
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
  targetTenantId?: string | null,
  callerTenantId?: string | null,
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

/**
 * Enforces the object-level ownership boundary for Receipt retrieval.
 * Respects ADR-0111, ADR-0074, ADR-0117, and ADR-0135:
 * - Administrative and cashiering roles (Owner, Manager, Receptionist, Kitchen Staff)
 *   or users holding management permissions (receipts.manage, billing.manage, sales.manage, *)
 *   possess operational visibility across the tenant.
 * - End-client / customer users (Client, Member roles) are strictly confined to their own receipts
 *   (receipt.clientSnapshot.clientId === callerId).
 * - Non-administrative roles (e.g. Trainer without client assignment, unprivileged users)
 *   are denied access to other clients' or facility-wide financial receipts.
 */
export function enforceReceiptOwnershipBoundary(
  receipt: Receipt,
  currentUser?: ReceiptCurrentUser,
): void {
  if (!currentUser) {
    return;
  }

  const roles = currentUser.roles ?? [];
  const permissions = currentUser.permissions ?? [];
  const normalize = (p: string) => p.replace(/:/g, '.');
  const normUserPerms = permissions.map(normalize);

  const hasRestrictedRole = roles.some(
    (r) => r === 'Client' || r === 'Member' || r === 'Trainer' || r === 'Visitor' || r === 'Guest',
  );

  // 1. Staff Administrative / Operational Privilege Check
  const isPrivilegedStaff =
    normUserPerms.includes('*') ||
    normUserPerms.includes('*:*:*') ||
    normUserPerms.includes('*.*.*') ||
    normUserPerms.includes('receipts.*') ||
    normUserPerms.includes('receipts.manage') ||
    normUserPerms.includes('billing.manage') ||
    normUserPerms.includes('sales.manage') ||
    roles.some(
      (r) =>
        r === 'Owner' ||
        r === 'Gym Owner' ||
        r === 'Manager' ||
        r === 'Gym Manager' ||
        r === 'Platform Admin' ||
        r === 'Receptionist' ||
        r === 'Kitchen Staff' ||
        r.includes('Owner') ||
        r.includes('Manager'),
    ) ||
    (!hasRestrictedRole && (roles.length === 0 || normUserPerms.includes('receipts.read')));

  if (isPrivilegedStaff) {
    // Authorized to view any receipt within their tenant boundary
    return;
  }

  const callerId = currentUser.clientId ?? currentUser.id ?? currentUser.userId;

  // 2. Client / End-Customer Object Ownership Check
  const isClient = roles.includes('Client') || roles.includes('Member');
  if (isClient) {
    const receiptClientId = receipt.clientSnapshot?.clientId;
    if (!receiptClientId || !callerId || receiptClientId !== callerId) {
      throw new ReceiptUnauthorizedException(
        'Access denied: clients are only authorized to access their own receipts.',
      );
    }
    return;
  }

  // 3. Trainer / Other Non-Staff Roles
  // Trainers lack general billing/receipt visibility across the facility (ADR-0074).
  if (roles.includes('Trainer')) {
    const receiptClientId = receipt.clientSnapshot?.clientId;
    if (!receiptClientId || !callerId || receiptClientId !== callerId) {
      throw new ReceiptUnauthorizedException(
        'Access denied: trainers are not authorized to view general facility receipts.',
      );
    }
    return;
  }

  // 4. Default: Unprivileged or unauthorized role attempting to read (Fail-Closed)
  throw new ReceiptUnauthorizedException(
    'Access denied: user is not authorized to access this receipt document.',
  );
}

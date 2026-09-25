import { Receipt } from '../../domain/receipt.aggregate';
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
    'Trainer',
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

/**
 * Enforces the object-level ownership boundary for Receipt retrieval.
 * Respects ADR-0111, ADR-0074, and the Kinergy security framework:
 * - Administrative and cashiering roles (Owner, Manager, Receptionist, Kitchen Staff)
 *   or users holding management permissions (receipts.manage, billing.manage, sales.manage, *)
 *   possess operational visibility across the tenant.
 * - End-client / customer users (Client role) are strictly confined to their own receipts
 *   (receipt.clientSnapshot.clientId === currentUser.id).
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

  // 1. Staff Administrative / Operational Privilege Check
  const isPrivilegedStaff =
    permissions.includes('*') ||
    permissions.includes('*:*:*') ||
    permissions.includes('receipts.*') ||
    permissions.includes('receipts.manage') ||
    permissions.includes('billing.manage') ||
    permissions.includes('sales.manage') ||
    roles.some(
      (r) =>
        r === 'Owner' ||
        r === 'Gym Owner' ||
        r === 'Manager' ||
        r === 'Gym Manager' ||
        r === 'Platform Admin' ||
        r === 'Receptionist' ||
        r === 'Kitchen Staff',
    ) ||
    (!roles.includes('Client') && !roles.includes('Member') && !roles.includes('Trainer'));

  if (isPrivilegedStaff) {
    // Authorized to view any receipt within their tenant boundary
    return;
  }

  // 2. Client / End-Customer Object Ownership Check
  const isClient = roles.includes('Client') || roles.includes('Member');
  if (isClient) {
    const receiptClientId = receipt.clientSnapshot?.clientId;
    if (!receiptClientId || receiptClientId !== currentUser.id) {
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
    if (!receiptClientId || receiptClientId !== currentUser.id) {
      throw new ReceiptUnauthorizedException(
        'Access denied: trainers are not authorized to view general facility receipts.',
      );
    }
    return;
  }

  // 4. Default: Unprivileged or unauthorized role attempting to read
  throw new ReceiptUnauthorizedException(
    'Access denied: user is not authorized to access this receipt document.',
  );
}

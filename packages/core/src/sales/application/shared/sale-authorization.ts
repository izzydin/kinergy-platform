import { Sale } from '../../domain/sale.aggregate';
import { SaleUnauthorizedException } from '../exceptions/sale-unauthorized.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';

export interface SaleCurrentUser {
  readonly id?: string;
  readonly tenantId?: string;
  readonly roles?: string[];
  readonly permissions?: string[];
}

export const SALE_MUTATION_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
  'Kitchen Staff',
];

export const SALE_CANCELLATION_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
];

/**
 * Checks caller permissions and roles against required sales privileges.
 * Respects Phase 1 RBAC, ADR-0111, and ADR-0135.
 */
export function checkSaleAuthorization(
  currentUser?: SaleCurrentUser,
  requiredPermissions: string[] = ['sales.read'],
  allowedRoles: string[] = [
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
  ],
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
    throw new SaleUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this sale action.`,
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
      throw new SaleUnauthorizedException(
        `User roles [${roles.join(', ')}] are not authorized for this sale action.`,
      );
    }
  }

  // 2. Permission validation: must satisfy required permissions
  const normalize = (p: string) => p.replace(/:/g, '.');
  const normRequired = requiredPermissions.map(normalize);
  const normUserPerms = permissions.map(normalize);

  const hasPermission = normUserPerms.some((p) => {
    if (p === '*' || p === '*:*:*' || p === '*.*.*' || p === 'sales.*') {
      return true;
    }
    if (normRequired.includes(p)) {
      return true;
    }
    // sales.manage covers sales.read, sales.create, and sales.cancel
    if (
      p === 'sales.manage' &&
      normRequired.some(
        (rp) =>
          rp === 'sales.read' ||
          rp === 'sales.create' ||
          rp === 'sales.cancel' ||
          rp === 'sales.manage',
      )
    ) {
      return true;
    }
    // Backward compatibility with legacy billing permissions
    if (p === 'billing.manage') {
      return true;
    }
    if (p === 'billing.read' && normRequired.includes('sales.read')) {
      return true;
    }
    if (
      p === 'billing.write' &&
      (normRequired.includes('sales.create') || normRequired.includes('sales.manage'))
    ) {
      return true;
    }
    return false;
  });

  if (!hasPermission) {
    throw new SaleUnauthorizedException(
      `User does not possess required permissions (${requiredPermissions.join(', ')}) to perform this sale action.`,
    );
  }
}

/**
 * Enforces multi-tenant boundary checks between caller context and target aggregate.
 * Per ADR-0135 Section 9: Cross-tenant access returns SaleNotFoundException (yielding 404)
 * to prevent leaking the existence of resources across tenant boundaries.
 */
export function enforceSaleTenantIsolation(
  targetTenantId?: string,
  callerTenantId?: string,
  saleId: string = 'unknown',
): void {
  if (!targetTenantId || !callerTenantId) {
    return;
  }

  if (targetTenantId.trim() !== callerTenantId.trim()) {
    throw new SaleNotFoundException(saleId);
  }
}

/**
 * Enforces the object-level ownership boundary for Sale access.
 * Respects ADR-0111, ADR-0074, and ADR-0135:
 * - Operational staff (Owner, Manager, Receptionist, Kitchen Staff) possess visibility across the tenant.
 * - End-client / customer users (Client role) are strictly confined to their own sales
 *   (sale.clientId === currentUser.id). If requesting another client's sale or an anonymous sale,
 *   rejects with SaleNotFoundException (yielding 404) to avoid resource existence disclosure.
 * - Trainer: can view sales within the tenant for operational session verification.
 */
export function enforceSaleOwnershipBoundary(sale: Sale, currentUser?: SaleCurrentUser): void {
  if (!currentUser) {
    return;
  }

  const roles = currentUser.roles ?? [];
  const permissions = currentUser.permissions ?? [];

  // 1. Staff Administrative / Operational Privilege Check
  const isPrivilegedStaff =
    permissions.includes('*') ||
    permissions.includes('*:*:*') ||
    permissions.includes('sales.*') ||
    permissions.includes('sales.manage') ||
    permissions.includes('billing.manage') ||
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
    return;
  }

  // 2. Client / End-Customer Object Ownership Check
  const isClient = roles.includes('Client') || roles.includes('Member');
  if (isClient) {
    const saleClientId = sale.clientId;
    if (!saleClientId || saleClientId !== currentUser.id) {
      throw new SaleNotFoundException(sale.id.value);
    }
    return;
  }

  // 3. Trainer Operational Inspection
  if (roles.includes('Trainer')) {
    return;
  }

  throw new SaleUnauthorizedException(
    'Access denied: user is not authorized to access this sale record.',
  );
}

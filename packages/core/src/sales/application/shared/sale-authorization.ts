import { Sale } from '../../domain/sale.aggregate';
import { SaleUnauthorizedException } from '../exceptions/sale-unauthorized.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';

export interface SaleCurrentUser {
  readonly id?: string;
  readonly userId?: string;
  readonly tenantId?: string | null;
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
  'Trainer',
  'Kitchen Staff',
  'Therapist',
];

export const SALE_CANCELLATION_ROLES: string[] = [
  'Owner',
  'Gym Owner',
  'Manager',
  'Gym Manager',
  'Platform Admin',
  'Receptionist',
  'Trainer',
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
    if (p === 'billing.write' && normRequired.includes('sales.create')) {
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
  targetTenantId?: string | null,
  callerTenantId?: string | null,
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
        r === 'Trainer' ||
        r === 'Kitchen Staff',
    ) ||
    (!roles.includes('Client') && !roles.includes('Member'));

  if (isPrivilegedStaff) {
    return;
  }

  // 2. Client / End-Customer Object Ownership Check
  const isClient = roles.includes('Client') || roles.includes('Member');
  if (isClient) {
    const saleClientId = sale.clientId;
    const callerId = currentUser.id ?? currentUser.userId;
    if (!saleClientId || saleClientId !== callerId) {
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

/**
 * Authoritative category definitions for commercial operations.
 */
export enum CommercialCategory {
  FOOD_DRINK = 'FOOD_DRINK',
  MEMBERSHIP = 'MEMBERSHIP',
  CLINICAL = 'CLINICAL',
  ROOM_RENTAL = 'ROOM_RENTAL',
  GENERIC_RETAIL = 'GENERIC_RETAIL',
}

/**
 * Maps arbitrary upstream domain source types, category strings, or enum identifiers
 * to their corresponding canonical CommercialCategory.
 */
export function resolveCommercialCategory(rawType?: string | null): CommercialCategory {
  if (!rawType) return CommercialCategory.GENERIC_RETAIL;
  const t = String(rawType).toUpperCase().trim();
  if (
    t === 'FOOD' ||
    t === 'DRINK' ||
    t === 'INVENTORY_ITEM' ||
    t === 'HEALTHY_MEALS' ||
    t === 'HEALTHY_DRINKS' ||
    t === 'SUPPLEMENTS' ||
    t === 'RETAIL_PRODUCTS'
  ) {
    return CommercialCategory.FOOD_DRINK;
  }
  if (t === 'GYM_MEMBERSHIP' || t === 'MEMBERSHIP_PLAN') {
    return CommercialCategory.MEMBERSHIP;
  }
  if (t === 'KINESIOLOGY_SESSION' || t === 'TREATMENT_SESSION' || t === 'KINESIOLOGY') {
    return CommercialCategory.CLINICAL;
  }
  if (t === 'ROOM_RENTAL' || t === 'CUSTOM_SERVICE') {
    return CommercialCategory.ROOM_RENTAL;
  }
  return CommercialCategory.GENERIC_RETAIL;
}

/**
 * Mixed Cart Authorization Guard (ADR-0135 / Least Privilege):
 * If a mixed cart contains Food/Drinks and another category, the user must be
 * authorized for every included category. Do not allow an unauthorized category
 * to be processed simply because the cart contains Food or Drink.
 */
export function assertSaleCategoriesAuthorized(
  currentUser?: SaleCurrentUser,
  categories: (string | null | undefined)[] = [],
): void {
  if (!currentUser) {
    return; // System or trusted context
  }

  const permissions = (currentUser.permissions ?? []).map((p) => p.replace(/:/g, '.'));
  const roles = currentUser.roles ?? [];

  const isSuperUser =
    roles.some(
      (r) =>
        r.includes('Owner') ||
        r.includes('Manager') ||
        r === 'Platform Admin' ||
        r === 'SUPER_ADMIN' ||
        r === 'ADMIN',
    ) || permissions.some((p) => p === '*' || p === '*:*:*' || p === '*.*.*' || p === 'sales.*');

  if (isSuperUser) {
    return;
  }

  const normCategories = Array.from(
    new Set(
      categories
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => resolveCommercialCategory(c)),
    ),
  );

  for (const cat of normCategories) {
    switch (cat) {
      case CommercialCategory.FOOD_DRINK: {
        const canSellFoodDrink =
          permissions.includes('inventory.read') ||
          permissions.includes('inventory.write') ||
          permissions.includes('kitchen.read') ||
          roles.includes('Kitchen Staff') ||
          roles.includes('Receptionist') ||
          roles.includes('RECEPTIONIST') ||
          roles.includes('Trainer') ||
          roles.includes('TRAINER') ||
          roles.some((r) => r.toLowerCase().includes('reception'));
        if (!canSellFoodDrink) {
          throw new SaleUnauthorizedException(
            'User is not authorized to sell Food and Drink items (requires inventory.read permission).',
          );
        }
        break;
      }
      case CommercialCategory.MEMBERSHIP: {
        const canSellMembership =
          !roles.includes('Kitchen Staff') &&
          (roles.includes('Receptionist') ||
            roles.includes('RECEPTIONIST') ||
            roles.includes('Trainer') ||
            roles.includes('TRAINER') ||
            permissions.includes('billing.write') ||
            permissions.includes('billing.manage') ||
            permissions.some((p) => p.startsWith('gym.')));
        if (!canSellMembership) {
          throw new SaleUnauthorizedException('User is not authorized to sell Gym Memberships.');
        }
        break;
      }
      case CommercialCategory.CLINICAL: {
        const canSellClinical =
          !roles.includes('Kitchen Staff') &&
          (roles.includes('Receptionist') ||
            roles.includes('RECEPTIONIST') ||
            roles.includes('Trainer') ||
            roles.includes('TRAINER') ||
            permissions.includes('appointments.create') ||
            permissions.includes('appointments.update') ||
            permissions.includes('billing.write'));
        if (!canSellClinical) {
          throw new SaleUnauthorizedException(
            'User is not authorized to sell Clinical/Kinesiology Sessions.',
          );
        }
        break;
      }
      case CommercialCategory.ROOM_RENTAL: {
        const canSellRoom =
          !roles.includes('Kitchen Staff') &&
          (roles.includes('Receptionist') ||
            roles.includes('RECEPTIONIST') ||
            roles.includes('Trainer') ||
            roles.includes('TRAINER') ||
            permissions.includes('billing.write') ||
            permissions.some((p) => p.startsWith('scheduling.')));
        if (!canSellRoom) {
          throw new SaleUnauthorizedException('User is not authorized to sell Room Rentals.');
        }
        break;
      }
      default:
        break;
    }
  }
}

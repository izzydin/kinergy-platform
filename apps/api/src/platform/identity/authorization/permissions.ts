/**
 * Authoritative Platform Permission Catalog and Codes
 * Conforming to hierarchical dot-notation: <module>.<resource>.<action>
 * Reference: ADR-0025, ADR-0111, ADR-0135
 */

export const PERMISSIONS = {
  USERS: {
    READ: 'users.read',
    WRITE: 'users.write',
    DELETE: 'users.delete',
  },
  CLIENTS: {
    READ: 'clients.read',
    WRITE: 'clients.write',
    DELETE: 'clients.delete',
  },
  APPOINTMENTS: {
    READ: 'appointments.read',
    CREATE: 'appointments.create',
    UPDATE: 'appointments.update',
    DELETE: 'appointments.delete',
  },
  KITCHEN: {
    READ: 'kitchen.read',
    ORDERS_MANAGE: 'kitchen.orders.manage',
  },
  INVENTORY: {
    READ: 'inventory.read',
    WRITE: 'inventory.write',
  },
  ASSETS: {
    READ: 'assets.read',
    WRITE: 'assets.write',
  },
  BILLING: {
    READ: 'billing.read',
    WRITE: 'billing.write',
  },
  SALES: {
    READ: 'sales.read',
    CREATE: 'sales.create',
    MANAGE: 'sales.manage',
    CANCEL: 'sales.cancel',
  },
  PAYMENTS: {
    READ: 'payments.read',
    CREATE: 'payments.create',
    MANAGE: 'payments.manage',
  },
  RECEIPTS: {
    READ: 'receipts.read',
    MANAGE: 'receipts.manage',
  },
  REPORTS: {
    READ: 'reports.read',
    EXPORT: 'reports.export',
  },
  SETTINGS: {
    READ: 'settings.read',
    WRITE: 'settings.write',
  },
  IDENTITY: {
    ROLES_READ: 'identity.roles.read',
    ROLES_WRITE: 'identity.roles.write',
    PERMISSIONS_READ: 'identity.permissions.read',
  },
} as const;

export type UserPermissionCode = (typeof PERMISSIONS.USERS)[keyof typeof PERMISSIONS.USERS];
export type ClientPermissionCode = (typeof PERMISSIONS.CLIENTS)[keyof typeof PERMISSIONS.CLIENTS];
export type AppointmentPermissionCode =
  (typeof PERMISSIONS.APPOINTMENTS)[keyof typeof PERMISSIONS.APPOINTMENTS];
export type KitchenPermissionCode = (typeof PERMISSIONS.KITCHEN)[keyof typeof PERMISSIONS.KITCHEN];
export type InventoryPermissionCode =
  (typeof PERMISSIONS.INVENTORY)[keyof typeof PERMISSIONS.INVENTORY];
export type AssetPermissionCode = (typeof PERMISSIONS.ASSETS)[keyof typeof PERMISSIONS.ASSETS];
export type BillingPermissionCode = (typeof PERMISSIONS.BILLING)[keyof typeof PERMISSIONS.BILLING];
export type SalesPermissionCode = (typeof PERMISSIONS.SALES)[keyof typeof PERMISSIONS.SALES];
export type PaymentPermissionCode =
  (typeof PERMISSIONS.PAYMENTS)[keyof typeof PERMISSIONS.PAYMENTS];
export type ReceiptPermissionCode =
  (typeof PERMISSIONS.RECEIPTS)[keyof typeof PERMISSIONS.RECEIPTS];
export type ReportPermissionCode = (typeof PERMISSIONS.REPORTS)[keyof typeof PERMISSIONS.REPORTS];
export type SettingPermissionCode =
  (typeof PERMISSIONS.SETTINGS)[keyof typeof PERMISSIONS.SETTINGS];
export type IdentityPermissionCode =
  (typeof PERMISSIONS.IDENTITY)[keyof typeof PERMISSIONS.IDENTITY];

export type PermissionCode =
  | UserPermissionCode
  | ClientPermissionCode
  | AppointmentPermissionCode
  | KitchenPermissionCode
  | InventoryPermissionCode
  | AssetPermissionCode
  | BillingPermissionCode
  | SalesPermissionCode
  | PaymentPermissionCode
  | ReceiptPermissionCode
  | ReportPermissionCode
  | SettingPermissionCode
  | IdentityPermissionCode;

/**
 * Array of all authoritative permission codes in the system.
 */
export const ALL_PERMISSION_CODES: readonly PermissionCode[] = Object.freeze(
  Object.values(PERMISSIONS).flatMap((group) => Object.values(group)),
);

/**
 * Type guard verifying if a string is a registered permission code.
 */
export function isPermissionCode(value: string): value is PermissionCode {
  return ALL_PERMISSION_CODES.includes(value as PermissionCode);
}

/**
 * Normalizes colon-delimited permission notation (e.g. 'sales:read') to canonical
 * dot-notation ('sales.read') in accordance with ADR-0025, ADR-0111, and ADR-0135.
 */
export function normalizePermissionCode(code: string): string {
  if (!code || typeof code !== 'string') {
    return code;
  }
  return code.trim().replace(/:/g, '.');
}

/**
 * Checks whether a given string is a registered or wildcard permission.
 */
export function isValidPermission(permission: string): boolean {
  if (!permission || typeof permission !== 'string') {
    return false;
  }
  if (permission === '*' || permission === '*:*:*' || permission === '*.*.*') {
    return true;
  }
  if (permission.endsWith('.*') || permission.endsWith(':*')) {
    return true;
  }
  const normalized = normalizePermissionCode(permission);
  return isPermissionCode(normalized);
}

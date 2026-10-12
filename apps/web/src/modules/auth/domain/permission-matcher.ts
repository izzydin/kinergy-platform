/**
 * Permission and Role Matcher Engine
 * Scope: Authentication & Authorization Domain (`modules/auth`)
 *
 * Aligns client-side permission evaluation with backend `DefaultAuthorizationEvaluator`
 * and ADR-0111 / ADR-0135 specifications:
 *
 * 1. Normalizes colon and dot notation (e.g. `sales:create` <-> `sales.create`).
 * 2. Matches universal wildcard patterns (`*`, `*:*:*`, `*.*.*`).
 * 3. Enforces capability hierarchies:
 *    - `billing.manage` covers all billing, sales, payments, and receipts operations.
 *    - `sales.manage` covers `sales.create`, `sales.read`, `sales.cancel`, and `receipts.read`.
 *    - `payments.manage` covers `payments.create` and `payments.read`.
 *    - `receipts.manage` covers `receipts.create` and `receipts.read`.
 * 4. Preserves backward compatibility with legacy `billing.read` and `billing.write`.
 */

export function normalizePermissionNotation(permission: string): string {
  if (!permission) return '';
  return permission.trim().replace(/:/g, '.').toLowerCase();
}

/**
 * Evaluates whether a set of user permissions satisfies the required permission claim.
 */
export function matchPermission(
  userPermissions: readonly string[] | undefined | null,
  requiredPermission: string,
): boolean {
  if (!userPermissions || userPermissions.length === 0 || !requiredPermission) {
    return false;
  }

  const normRequired = normalizePermissionNotation(requiredPermission);
  if (!normRequired) return false;

  const normUserPerms = userPermissions.map(normalizePermissionNotation);

  // 1. Universal Wildcard Matching
  if (
    userPermissions.includes('*') ||
    userPermissions.includes('*:*:*') ||
    normUserPerms.includes('*') ||
    normUserPerms.includes('*.*.*') ||
    normUserPerms.includes(normRequired)
  ) {
    return true;
  }

  // 2. Capability Hierarchy: billing.manage covers all billing, sales, payments, and receipts
  if (
    normUserPerms.includes('billing.manage') &&
    (normRequired.startsWith('sales.') ||
      normRequired.startsWith('payments.') ||
      normRequired.startsWith('receipts.') ||
      normRequired.startsWith('billing.'))
  ) {
    return true;
  }

  // 3. Capability Hierarchy: sales.manage covers all sales operations and receipts read
  if (
    normUserPerms.includes('sales.manage') &&
    (normRequired.startsWith('sales.') || normRequired === 'receipts.read')
  ) {
    return true;
  }

  // 4. Capability Hierarchy: payments.manage covers all payments operations
  if (normUserPerms.includes('payments.manage') && normRequired.startsWith('payments.')) {
    return true;
  }

  // 5. Capability Hierarchy: receipts.manage covers all receipts operations
  if (normUserPerms.includes('receipts.manage') && normRequired.startsWith('receipts.')) {
    return true;
  }

  // 6. Backward compatibility mappings
  if (
    normUserPerms.includes('billing.read') &&
    (normRequired === 'sales.read' || normRequired === 'receipts.read')
  ) {
    return true;
  }

  if (
    normUserPerms.includes('billing.write') &&
    (normRequired === 'sales.create' || normRequired === 'sales.manage')
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a set of user roles satisfies the required role.
 */
export function matchRole(
  userRoles: readonly string[] | undefined | null,
  requiredRole: string,
): boolean {
  if (!userRoles || userRoles.length === 0 || !requiredRole) {
    return false;
  }

  const targetRole = requiredRole.trim().toLowerCase();
  return userRoles.some((r) => r.trim().toLowerCase() === targetRole);
}

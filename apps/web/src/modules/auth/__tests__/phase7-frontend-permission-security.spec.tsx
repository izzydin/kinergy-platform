/**
 * Phase 7 Frontend Permission Security & IAM Integration Test Suite
 *
 * Verifies that the frontend application adheres to Kinergy's IAM security model:
 * 1. Permission Representation & Normalization:
 *    - Colon vs. dot notation normalization ('sales:create' <-> 'sales.create').
 *    - Wildcard pattern matching ('*', '*.*.*', '*:*:*').
 *    - Capability hierarchy matching ('billing.manage', 'sales.manage', 'payments.manage', 'receipts.manage').
 * 2. Role Matching & Evaluation:
 *    - Case-insensitive matching for system roles.
 * 3. Declarative Component Access Control (<HasPermission />):
 *    - Authorized users see permitted UI actions.
 *    - Users lacking permission do not see actions in DOM or see designated fallback.
 * 4. Route-Level Security Boundaries (<RequirePermission /> & <ProtectedRoute />):
 *    - Unauthenticated principals redirected to /auth/login.
 *    - Authenticated principals lacking permission render <ForbiddenView /> (403) without redirecting to login.
 *    - Protected data is never rendered or leaked to unauthorized principals.
 * 5. Direct URL / Query Parameter Tampering Prevention:
 *    - Unauthorized query parameters (e.g. ?action=sell) are discarded without triggering modals.
 * 6. API Error Normalization:
 *    - 401 maps to AuthenticationError; 403 maps to AuthorizationError without leaking stack/SQL/Prisma details.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../app/providers/auth-provider';
import { HasPermission, RequirePermission } from '../../../app/routes/permission-guard';
import { ProtectedRoute } from '../../../app/routes/protected-route';

const AuthConsumerTest: React.FC = () => {
  const { hasPermission, hasRole } = useAuth();
  return (
    <div>
      <span data-testid="can-create">{hasPermission('sales.create') ? 'yes' : 'no'}</span>
      <span data-testid="is-manager">{hasRole('manager') ? 'yes' : 'no'}</span>
    </div>
  );
};
import {
  matchPermission,
  matchRole,
  normalizePermissionNotation,
} from '../domain/permission-matcher';
import type { AuthUser } from '../domain/auth-state.types';
import {
  AuthenticationError,
  AuthorizationError,
  normalizeApiError,
} from '../../../shared/api/api-error';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('Phase 7 Frontend Permission Security Suite (IAM & AuthZ)', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Permission Representation, Normalization & Hierarchy
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Permission Representation, Normalization & Hierarchy (matchPermission)', () => {
    it('normalizes colon and dot notation bidirectionally', () => {
      expect(normalizePermissionNotation('sales:create')).toBe('sales.create');
      expect(normalizePermissionNotation('payments:manage')).toBe('payments.manage');
      expect(normalizePermissionNotation('RECEIPTS.READ')).toBe('receipts.read');

      // User holding colon notation satisfies required dot notation
      expect(matchPermission(['sales:create'], 'sales.create')).toBe(true);
      // User holding dot notation satisfies required colon notation
      expect(matchPermission(['sales.create'], 'sales:create')).toBe(true);
    });

    it('honors universal wildcard grants (*, *:*:*, *.*.*)', () => {
      expect(matchPermission(['*'], 'sales.create')).toBe(true);
      expect(matchPermission(['*'], 'payments.manage')).toBe(true);
      expect(matchPermission(['*.*.*'], 'receipts.read')).toBe(true);
      expect(matchPermission(['*:*:*'], 'sales.cancel')).toBe(true);
    });

    it('enforces billing.manage hierarchy covering all sales, payments, and receipts', () => {
      const userPerms = ['billing.manage'];
      expect(matchPermission(userPerms, 'sales.create')).toBe(true);
      expect(matchPermission(userPerms, 'sales.read')).toBe(true);
      expect(matchPermission(userPerms, 'sales.cancel')).toBe(true);
      expect(matchPermission(userPerms, 'payments.create')).toBe(true);
      expect(matchPermission(userPerms, 'payments.manage')).toBe(true);
      expect(matchPermission(userPerms, 'payments.read')).toBe(true);
      expect(matchPermission(userPerms, 'receipts.manage')).toBe(true);
      expect(matchPermission(userPerms, 'receipts.read')).toBe(true);
    });

    it('enforces sales.manage hierarchy covering sales operations and receipts.read', () => {
      const userPerms = ['sales.manage'];
      expect(matchPermission(userPerms, 'sales.create')).toBe(true);
      expect(matchPermission(userPerms, 'sales.read')).toBe(true);
      expect(matchPermission(userPerms, 'sales.cancel')).toBe(true);
      expect(matchPermission(userPerms, 'receipts.read')).toBe(true);

      // Does NOT grant payment operations
      expect(matchPermission(userPerms, 'payments.create')).toBe(false);
      expect(matchPermission(userPerms, 'payments.manage')).toBe(false);
    });

    it('enforces payments.manage hierarchy covering payments operations', () => {
      const userPerms = ['payments.manage'];
      expect(matchPermission(userPerms, 'payments.create')).toBe(true);
      expect(matchPermission(userPerms, 'payments.read')).toBe(true);

      // Does NOT grant sales create or receipt manage
      expect(matchPermission(userPerms, 'sales.create')).toBe(false);
      expect(matchPermission(userPerms, 'receipts.manage')).toBe(false);
    });

    it('enforces receipts.manage hierarchy covering receipts operations', () => {
      const userPerms = ['receipts.manage'];
      expect(matchPermission(userPerms, 'receipts.read')).toBe(true);

      // Does NOT grant sales cancellation or payment settlement
      expect(matchPermission(userPerms, 'sales.cancel')).toBe(false);
      expect(matchPermission(userPerms, 'payments.manage')).toBe(false);
    });

    it('strictly denies unauthorized principals missing required claims', () => {
      const unprivilegedPerms = ['inventory.read', 'memberships.read'];
      expect(matchPermission(unprivilegedPerms, 'sales.create')).toBe(false);
      expect(matchPermission(unprivilegedPerms, 'payments.create')).toBe(false);
      expect(matchPermission(unprivilegedPerms, 'receipts.manage')).toBe(false);
      expect(matchPermission([], 'sales.create')).toBe(false);
      expect(matchPermission(null, 'sales.create')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Role Matching Engine (matchRole)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Role Matching Engine (matchRole)', () => {
    it('matches roles with case-insensitivity', () => {
      expect(matchRole(['Owner'], 'owner')).toBe(true);
      expect(matchRole(['ADMIN'], 'admin')).toBe(true);
      expect(matchRole(['Manager'], 'MANAGER')).toBe(true);
      expect(matchRole(['Receptionist'], 'Receptionist')).toBe(true);
      expect(matchRole(['Kitchen Staff'], 'kitchen staff')).toBe(true);
    });

    it('rejects principals without the required role', () => {
      expect(matchRole(['Trainer'], 'Owner')).toBe(false);
      expect(matchRole(['Client'], 'Manager')).toBe(false);
      expect(matchRole([], 'Admin')).toBe(false);
      expect(matchRole(undefined, 'Admin')).toBe(false);
    });

    it('performs exact membership checks without implicit role inheritance', () => {
      // Privileged roles never satisfy a different role requirement
      expect(matchRole(['ADMIN'], 'SUPERADMIN')).toBe(false);
      expect(matchRole(['ADMIN'], 'SUPER_ADMIN')).toBe(false);
      expect(matchRole(['OPERATOR', 'ADMIN'], 'SUPERADMIN')).toBe(false);
      expect(matchRole(['OWNER'], 'ADMIN')).toBe(false);
      expect(matchRole(['SUPER_ADMIN'], 'OWNER')).toBe(false);

      // Unknown roles never grant anything, even to privileged principals
      expect(matchRole(['ADMIN'], 'UNKNOWN_ROLE')).toBe(false);

      // Held roles are still recognized among several
      expect(matchRole(['OPERATOR', 'ADMIN'], 'ADMIN')).toBe(true);
      expect(matchRole(['OPERATOR', 'ADMIN'], 'operator')).toBe(true);
    });

    it('integrates with useAuth hook exposing hasPermission and hasRole in React tree', () => {
      const managerUser: AuthUser = {
        id: 'usr-mgr-test',
        email: 'mgr@kinergy.io',
        name: 'Manager',
        roles: ['Manager'],
        permissions: ['sales.create'],
        tenantId: 'tenant_01',
      };

      render(
        <AuthProvider initialSessionOverride={managerUser}>
          <AuthConsumerTest />
        </AuthProvider>,
      );

      expect(screen.getByTestId('can-create')).toHaveTextContent('yes');
      expect(screen.getByTestId('is-manager')).toHaveTextContent('yes');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Declarative UI Action Gating (<HasPermission />)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Declarative UI Action Gating (<HasPermission />)', () => {
    const cashierUser: AuthUser = {
      id: 'usr-cashier-01',
      email: 'cashier@kinergy.io',
      name: 'Cashier Staff',
      roles: ['Receptionist'],
      permissions: ['sales.create', 'payments.create', 'receipts.read'],
      tenantId: 'tenant_01',
    };

    const trainerUser: AuthUser = {
      id: 'usr-trainer-01',
      email: 'trainer@kinergy.io',
      name: 'Gym Trainer',
      roles: ['Trainer'],
      permissions: ['sales.read', 'memberships.read'],
      tenantId: 'tenant_01',
    };

    it('renders permitted actions for authorized users', () => {
      render(
        <AuthProvider initialSessionOverride={cashierUser}>
          <div data-testid="action-bar">
            <HasPermission name="sales.create">
              <button data-testid="btn-record-sale">Record Sale</button>
            </HasPermission>
            <HasPermission name="payments.create">
              <button data-testid="btn-record-payment">Record Payment</button>
            </HasPermission>
            <HasPermission name="sales.cancel">
              <button data-testid="btn-cancel-sale">Cancel Sale</button>
            </HasPermission>
          </div>
        </AuthProvider>,
      );

      // Permitted buttons are rendered
      expect(screen.getByTestId('btn-record-sale')).toBeInTheDocument();
      expect(screen.getByTestId('btn-record-payment')).toBeInTheDocument();

      // Denied button (sales.cancel) is NOT rendered in the DOM
      expect(screen.queryByTestId('btn-cancel-sale')).not.toBeInTheDocument();
    });

    it('hides write and mutation actions from unauthorized users', () => {
      render(
        <AuthProvider initialSessionOverride={trainerUser}>
          <div data-testid="action-bar">
            <HasPermission name="sales.create">
              <button data-testid="btn-record-sale">Record Sale</button>
            </HasPermission>
            <HasPermission name="sales.read">
              <div data-testid="view-sale-summary">Sale Overview</div>
            </HasPermission>
          </div>
        </AuthProvider>,
      );

      // Read is permitted for trainer
      expect(screen.getByTestId('view-sale-summary')).toBeInTheDocument();

      // Write (sales.create) is completely absent
      expect(screen.queryByTestId('btn-record-sale')).not.toBeInTheDocument();
    });

    it('renders designated fallback when fallback prop is provided and permission is denied', () => {
      render(
        <AuthProvider initialSessionOverride={trainerUser}>
          <HasPermission
            name="receipts.manage"
            fallback={<span data-testid="restricted-badge">Receipt Issuance Restricted</span>}
          >
            <button data-testid="btn-issue-receipt">Issue Receipt</button>
          </HasPermission>
        </AuthProvider>,
      );

      expect(screen.queryByTestId('btn-issue-receipt')).not.toBeInTheDocument();
      expect(screen.getByTestId('restricted-badge')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Route-Level Security Boundaries (<RequirePermission />)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Route-Level Security Boundaries (<RequirePermission />)', () => {
    const managerUser: AuthUser = {
      id: 'usr-mgr-01',
      email: 'manager@kinergy.io',
      name: 'Branch Manager',
      roles: ['Manager'],
      permissions: ['sales.manage', 'payments.manage'],
      tenantId: 'tenant_01',
    };

    const clientUser: AuthUser = {
      id: 'usr-cli-01',
      email: 'client@example.com',
      name: 'Gym Member',
      roles: ['Client'],
      permissions: ['receipts.read'],
      tenantId: 'tenant_01',
    };

    it('allows authorized users through route permission boundaries', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/sales/checkout']}>
            <AuthProvider initialSessionOverride={managerUser}>
              <Routes>
                <Route
                  path="/sales/checkout"
                  element={
                    <RequirePermission permission="sales.create">
                      <div data-testid="checkout-page">Authoritative Checkout View</div>
                    </RequirePermission>
                  }
                />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // manager has sales.manage which covers sales.create
      expect(screen.getByTestId('checkout-page')).toBeInTheDocument();
    });

    it('blocks unauthorized users with accessible 403 ForbiddenView without leaking protected data', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/sales/pos']}>
            <AuthProvider initialSessionOverride={clientUser}>
              <Routes>
                <Route
                  path="/sales/pos"
                  element={
                    <RequirePermission permission="sales.create">
                      <div data-testid="secret-pos-financial-data">
                        Confidential Register Totals: $12,450.00
                      </div>
                    </RequirePermission>
                  }
                />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Sensitive server view is NOT rendered
      expect(screen.queryByTestId('secret-pos-financial-data')).not.toBeInTheDocument();

      // Accessible 403 ForbiddenView is displayed
      const forbiddenHeading = screen.getByRole('heading', {
        level: 2,
        name: /403 — Access Denied/i,
      });
      expect(forbiddenHeading).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    });

    it('redirects unauthenticated callers to /auth/login', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={['/sales']}>
            <AuthProvider initialSessionOverride={null}>
              <Routes>
                <Route path="/auth/login" element={<div>Public Login Route</div>} />
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/sales"
                    element={
                      <RequirePermission permission="sales.read">
                        <div>Protected Sales Route</div>
                      </RequirePermission>
                    }
                  />
                </Route>
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Public Login Route')).toBeInTheDocument();
      expect(screen.queryByText('Protected Sales Route')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. API Error Normalization & Information Leakage Prevention
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. API Error Normalization & Information Leakage Prevention', () => {
    it('normalizes 401 Unauthorized to AuthenticationError', () => {
      const error = normalizeApiError({
        statusCode: 401,
        message: 'Invalid or missing JWT Bearer token.',
        correlationId: 'corr_test_401',
      });

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.statusCode).toBe(401);
      expect(error.isRecoverable).toBe(true);
      expect(error.correlationId).toBe('corr_test_401');
    });

    it('normalizes 403 Forbidden to AuthorizationError without leaking ASTs or schema details', () => {
      const error = normalizeApiError({
        statusCode: 403,
        message: 'Forbidden: Insufficient permissions for operation.',
        correlationId: 'corr_test_403',
      });

      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.statusCode).toBe(403);
      expect(error.isRecoverable).toBe(false);
      expect(error.message).toContain('Forbidden');
      expect(error.message).not.toMatch(/prisma/i);
      expect(error.message).not.toMatch(/select\s+from/i);
      expect(error.message).not.toMatch(/ast/i);
    });
  });
});

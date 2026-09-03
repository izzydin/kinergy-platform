import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { FeatureFlagProvider } from '../../../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../../../app/navigation/navigation-provider';
import { BreadcrumbProvider } from '../../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../../shared/ui/slots';
import { AppRouter } from '../../../../app/routes/app-router';
import type { AuthUser } from '../../../auth/domain/auth-state.types';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const READONLY_ASSET_OPERATOR: AuthUser = {
  id: 'usr-asset-read',
  email: 'reader@kinergy.io',
  name: 'Asset Auditor',
  roles: ['STAFF'],
  permissions: ['assets.read'],
  tenantId: 'tenant-test',
};

const WRITE_ASSET_OPERATOR: AuthUser = {
  id: 'usr-asset-write',
  email: 'manager@kinergy.io',
  name: 'Facility Manager',
  roles: ['OPERATOR'],
  permissions: ['assets.read', 'assets.write'],
  tenantId: 'tenant-test',
};

const UNAUTHORIZED_USER: AuthUser = {
  id: 'usr-unauth',
  email: 'other@kinergy.io',
  name: 'General Member',
  roles: ['MEMBER'],
  permissions: ['client:read'],
  tenantId: 'tenant-test',
};

function renderWithRoute(initialEntry: string, user: AuthUser) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={user}>
              <FeatureFlagProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </NotificationProvider>
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Fixed Assets Routing & Permission Integration', () => {
  describe('1. Read-Only Asset Operator (assets.read)', () => {
    it('allows access to assets list catalog route', async () => {
      renderWithRoute('/resources/assets', READONLY_ASSET_OPERATOR);
      expect(await screen.findByTestId('assets-list-page')).toBeInTheDocument();
      expect(screen.getByText('Fixed Assets')).toBeInTheDocument();
      // Should NOT render commission button because assets.write is missing
      expect(screen.queryByText('Commission New Asset')).not.toBeInTheDocument();
    });

    it('allows access to asset detail cockpit route', async () => {
      renderWithRoute('/resources/assets/ast-101', READONLY_ASSET_OPERATOR);
      expect(await screen.findByTestId('asset-detail-page')).toBeInTheDocument();
      expect(screen.getByText(/Asset Overview: ast-101/i)).toBeInTheDocument();
      // Should NOT render edit details button
      expect(screen.queryByText('Edit Details')).not.toBeInTheDocument();
    });

    it('allows access to asset audit history route', async () => {
      renderWithRoute('/resources/assets/ast-101/history', READONLY_ASSET_OPERATOR);
      expect(await screen.findByTestId('asset-history-page')).toBeInTheDocument();
      expect(screen.getByText(/Lifecycle Audit History: ast-101/i)).toBeInTheDocument();
    });

    it('allows access to asset maintenance ledger route', async () => {
      renderWithRoute('/resources/assets/ast-101/maintenance', READONLY_ASSET_OPERATOR);
      expect(await screen.findByTestId('asset-maintenance-page')).toBeInTheDocument();
      expect(screen.getByText(/Maintenance & Servicing Ledger: ast-101/i)).toBeInTheDocument();
    });

    it('denies access to commission route (/resources/assets/new) without assets.write', async () => {
      renderWithRoute('/resources/assets/new', READONLY_ASSET_OPERATOR);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('asset-create-page')).not.toBeInTheDocument();
    });

    it('denies access to edit details route (/resources/assets/:id/edit) without assets.write', async () => {
      renderWithRoute('/resources/assets/ast-101/edit', READONLY_ASSET_OPERATOR);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('asset-edit-page')).not.toBeInTheDocument();
    });
  });

  describe('2. Authorized Asset Manager (assets.read + assets.write)', () => {
    it('allows access to commission route (/resources/assets/new)', async () => {
      renderWithRoute('/resources/assets/new', WRITE_ASSET_OPERATOR);
      expect(await screen.findByTestId('asset-create-page')).toBeInTheDocument();
      expect(screen.getByText('Commission New Fixed Asset')).toBeInTheDocument();
    });

    it('allows access to edit details route (/resources/assets/ast-101/edit)', async () => {
      renderWithRoute('/resources/assets/ast-101/edit', WRITE_ASSET_OPERATOR);
      expect(await screen.findByTestId('asset-edit-page')).toBeInTheDocument();
      expect(screen.getByText(/Edit Asset Details: ast-101/i)).toBeInTheDocument();
    });

    it('renders write-action buttons on catalog and detail pages', async () => {
      const { unmount } = renderWithRoute('/resources/assets', WRITE_ASSET_OPERATOR);
      expect(await screen.findByText('Commission New Asset')).toBeInTheDocument();
      unmount();

      renderWithRoute('/resources/assets/ast-101', WRITE_ASSET_OPERATOR);
      expect(await screen.findByText('Edit Details')).toBeInTheDocument();
    });
  });

  describe('3. Unauthorized User (missing assets.read)', () => {
    it('denies access to assets catalog with 403 Forbidden', async () => {
      renderWithRoute('/resources/assets', UNAUTHORIZED_USER);
      expect(
        await screen.findByRole('heading', { name: /403 — Access Denied/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('assets-list-page')).not.toBeInTheDocument();
    });
  });
});

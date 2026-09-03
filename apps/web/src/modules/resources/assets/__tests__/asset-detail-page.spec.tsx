import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetDetailPage } from '../routes/asset-detail-page';
import { assetsApi } from '../api/assets-api';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import {
  AssetStatus,
  AssetCondition,
  AssetCategory,
  AssetHistoryEventType,
} from '@kinergy-platform/core';
import type { FixedAssetVM, PaginatedAssetHistoryVM, PaginatedMaintenanceVM } from '../types';

jest.mock('../api/assets-api');

const mockAsset: FixedAssetVM = {
  id: 'ast-001',
  assetTag: 'AST-KNRG-001',
  name: 'LifeFitness Platinum Club Treadmill',
  description: 'Heavy duty commercial running machine with interactive telemetry',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.EXCELLENT,
  location: {
    facilityId: 'fac-main',
    roomId: 'Cardio Studio A',
    zone: 'Row 3 East',
    description: 'Directly under air conditioning vent',
  },
  purchaseDate: '2025-01-15T00:00:00.000Z',
  purchaseValueAmount: 8500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 7800,
  notes: 'Quarterly belt lubricant inspection required.',
  version: 3,
  createdAt: '2025-01-15T00:00:00.000Z',
  updatedAt: '2025-02-01T00:00:00.000Z',
};

const mockDecommissionedAsset: FixedAssetVM = {
  ...mockAsset,
  id: 'ast-retired',
  assetTag: 'AST-KNRG-RET',
  name: 'Decommissioned Elliptical',
  status: AssetStatus.RETIRED,
  condition: AssetCondition.OUT_OF_SERVICE,
};

const mockHistoryResponse: PaginatedAssetHistoryVM = {
  items: [
    {
      id: 'evt-1',
      assetId: 'ast-001',
      eventType: AssetHistoryEventType.CREATED,
      description: 'Asset commissioned into active inventory',
      details: {},
      recordedByUserId: 'usr-admin',
      recordedAt: '2025-01-15T10:00:00.000Z',
    },
    {
      id: 'evt-2',
      assetId: 'ast-001',
      eventType: AssetHistoryEventType.TRANSFERRED,
      description: 'Relocated from Warehouse to Cardio Studio A',
      details: {},
      recordedByUserId: 'usr-admin',
      recordedAt: '2025-01-20T14:30:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 5,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const mockMaintenanceResponse: PaginatedMaintenanceVM = {
  items: [
    {
      id: 'maint-1',
      assetId: 'ast-001',
      serviceDate: '2025-02-01T00:00:00.000Z',
      description: 'Periodic drive belt tension adjustment',
      cost: {
        amount: 150,
        currency: 'USD',
      },
      performedBy: 'Kinergy Maintenance Services',
      notes: 'Calibrated speed optical encoder',
      recordedByUserId: 'usr-tech',
      createdAt: '2025-02-01T11:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 5,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const adminUser: AuthUser = {
  id: 'usr-1',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['assets.read', 'assets.write', 'billing.read'],
  tenantId: 'tenant-test',
};

const readOnlyUser: AuthUser = {
  id: 'usr-2',
  email: 'operator@kinergy.io',
  name: 'Asset Operator',
  roles: ['OPERATOR'],
  permissions: ['assets.read'],
  tenantId: 'tenant-test',
};

function renderAssetDetail(
  assetId: string,
  user: AuthUser = adminUser,
  customQueryClient?: QueryClient,
) {
  const client =
    customQueryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

  return render(
    <QueryClientProvider client={client}>
      <NotificationProvider>
        <AuthProvider initialSessionOverride={user}>
          <MemoryRouter initialEntries={[`/resources/assets/${assetId}`]}>
            <Routes>
              <Route path="/resources/assets/:id" element={<AssetDetailPage />} />
              <Route
                path="/resources/assets"
                element={<div data-testid="assets-catalog">Assets Catalog</div>}
              />
              <Route
                path="/resources/assets/:id/edit"
                element={<div data-testid="asset-edit-page">Edit Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('AssetDetailPage (Equipment Cockpit Experience)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
    (assetsApi.getAssetValuation as jest.Mock).mockResolvedValue({
      assetId: 'ast-001',
      purchaseValueAmount: 8500,
      currentEstimatedValueAmount: 7800,
      currency: 'USD',
    });
    (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue(mockHistoryResponse);
    (assetsApi.getMaintenanceHistory as jest.Mock).mockResolvedValue(mockMaintenanceResponse);
  });

  it('1. renders full asset identity, location, condition, and status cards', async () => {
    renderAssetDetail('ast-001', adminUser);

    expect(await screen.findByText('LifeFitness Platinum Club Treadmill')).toBeInTheDocument();
    expect(screen.getByText(/Asset Overview: ast-001/i)).toBeInTheDocument();
    expect(screen.getAllByText('AST-KNRG-001').length).toBeGreaterThanOrEqual(1);

    // Placement KPI card
    expect(screen.getAllByText('fac-main').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cardio Studio A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Row 3 East').length).toBeGreaterThanOrEqual(1);

    // Condition & Status badges
    expect(screen.getByText('Fleet Status')).toBeInTheDocument();
    expect(screen.getByText('Physical Condition')).toBeInTheDocument();
  });

  it('2. displays financial valuation metrics when user holds billing.read', async () => {
    renderAssetDetail('ast-001', adminUser);

    expect(await screen.findByText('LifeFitness Platinum Club Treadmill')).toBeInTheDocument();
    expect(await screen.findByText('$7,800.00')).toBeInTheDocument();
    expect(screen.getByText(/Invoice Cost: \$8,500/i)).toBeInTheDocument();
    expect(screen.queryByText('Confidential')).not.toBeInTheDocument();
  });

  it('3. protects financial valuation with Confidential badge when lacking billing.read', async () => {
    renderAssetDetail('ast-001', readOnlyUser);

    expect(await screen.findByText('LifeFitness Platinum Club Treadmill')).toBeInTheDocument();
    expect(await screen.findByText('Confidential')).toBeInTheDocument();
    expect(screen.getByText(/Requires billing.read clearance/i)).toBeInTheDocument();
    expect(screen.queryByText('$7,800.00')).not.toBeInTheDocument();
  });

  it('4. displays operational actions for authorized managers (assets.write)', async () => {
    renderAssetDetail('ast-001', adminUser);

    expect(await screen.findByText('LifeFitness Platinum Club Treadmill')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Edit Details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transfer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inspect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Service/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Valuation/i })).toBeInTheDocument();
  });

  it('5. hides mutation action buttons for read-only operators', async () => {
    renderAssetDetail('ast-001', readOnlyUser);

    expect(await screen.findByText('LifeFitness Platinum Club Treadmill')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: /Edit Details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Inspect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Service/i })).not.toBeInTheDocument();
  });

  it('6. disables actions and shows terminal invariant banner for RETIRED assets', async () => {
    (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockDecommissionedAsset);

    renderAssetDetail('ast-retired', adminUser);

    expect(await screen.findByTestId('terminal-asset-alert')).toBeInTheDocument();
    expect(screen.getByText(/Terminal Lifecycle State \(RETIRED\)/i)).toBeInTheDocument();
    expect(screen.getByText(/AST-INV-1/i)).toBeInTheDocument();

    // Buttons should be disabled
    expect(screen.getByRole('button', { name: /Transfer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Status/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Inspect/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Service/i })).toBeDisabled();
  });

  it('7. switches between Specifications, Maintenance, and History tabs', async () => {
    renderAssetDetail('ast-001', adminUser);

    expect(await screen.findByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByText('Directly under air conditioning vent')).toBeInTheDocument();

    // Switch to Maintenance tab
    fireEvent.click(screen.getByRole('button', { name: /Maintenance & Servicing/i }));
    expect(await screen.findByTestId('tab-maintenance')).toBeInTheDocument();
    expect(await screen.findByText('Periodic drive belt tension adjustment')).toBeInTheDocument();
    expect(screen.getByText(/Kinergy Maintenance Services/i)).toBeInTheDocument();

    // Switch to History tab
    fireEvent.click(screen.getByRole('button', { name: /Lifecycle Audit Ledger/i }));
    expect(await screen.findByTestId('tab-history')).toBeInTheDocument();
    expect(await screen.findByText('Asset commissioned into active inventory')).toBeInTheDocument();
    expect(screen.getByText('Relocated from Warehouse to Cardio Studio A')).toBeInTheDocument();
  });

  it('8. renders not-found state and allows retry on query error', async () => {
    (assetsApi.getAsset as jest.Mock).mockRejectedValue(new Error('Asset not found in domain'));

    renderAssetDetail('ast-missing', adminUser);

    expect(await screen.findByTestId('asset-detail-error')).toBeInTheDocument();
    expect(screen.getByText(/Asset not found in domain/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });
});

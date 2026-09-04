import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RecordAssetMaintenanceDialog } from '../components/asset-maintenance-dialog';
import { AssetMaintenancePage } from '../routes/asset-maintenance-page';
import { assetsApi } from '../api/assets-api';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import type { AuthUser } from '../../../../modules/auth/domain/auth-state.types';
import { AssetStatus, AssetCondition, AssetCategory } from '@kinergy-platform/core';
import type { FixedAssetVM, PaginatedMaintenanceVM } from '../types';

jest.mock('../api/assets-api');

const mockActiveAsset: FixedAssetVM = {
  id: 'ast-maint-1',
  assetTag: 'AST-KNRG-M1',
  name: 'Eleiko Olympic Power Rack',
  description: 'Commercial squat and bench rack',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.GOOD,
  location: {
    facilityId: 'fac-main',
    roomId: 'Strength Zone',
  },
  purchaseDate: '2025-01-10T00:00:00.000Z',
  purchaseValueAmount: 3500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 3200,
  version: 1,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

const mockDamagedAsset: FixedAssetVM = {
  ...mockActiveAsset,
  id: 'ast-maint-damaged',
  status: AssetStatus.DAMAGED,
  condition: AssetCondition.NEEDS_REPAIR,
};

const mockRetiredAsset: FixedAssetVM = {
  ...mockActiveAsset,
  id: 'ast-maint-retired',
  status: AssetStatus.RETIRED,
  condition: AssetCondition.OUT_OF_SERVICE,
};

const mockMaintenanceData: PaginatedMaintenanceVM = {
  items: [
    {
      id: 'maint-rec-1',
      assetId: 'ast-maint-1',
      serviceDate: '2025-02-15T00:00:00.000Z',
      description: 'Replaced Olympic bar J-cups and tightened safety pins',
      cost: {
        amount: 250,
        currency: 'USD',
      },
      performedBy: 'Eleiko Certified Technician',
      notes: 'Work Order #WO-4412; Invoice #INV-9901',
      recordedByUserId: 'usr-tech-1',
      createdAt: '2025-02-15T10:00:00.000Z',
    },
    {
      id: 'maint-rec-2',
      assetId: 'ast-maint-1',
      serviceDate: '2025-01-25T00:00:00.000Z',
      description: 'Quarterly structural bolt torque check',
      cost: {
        amount: 75,
        currency: 'USD',
      },
      performedBy: 'In-House Facilities Team',
      recordedByUserId: 'usr-tech-2',
      createdAt: '2025-01-25T09:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const authorizedManagerSession: AuthUser = {
  id: 'usr-mgr',
  email: 'manager@kinergy.test',
  name: 'Asset Manager',
  roles: ['ADMIN'],
  permissions: ['assets.read', 'assets.write', 'billing.read'],
  tenantId: 'tenant-test',
};

const restrictedTechnicianSession: AuthUser = {
  id: 'usr-tech',
  email: 'tech@kinergy.test',
  name: 'Field Technician',
  roles: ['TRAINER'],
  permissions: ['assets.read', 'assets.write'], // Lacks billing.read
  tenantId: 'tenant-test',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('Asset Maintenance Workflows (Recording & Authoritative Ledger)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RecordAssetMaintenanceDialog', () => {
    it('1. logs valid servicing work order and reconciles cache state', async () => {
      (assetsApi.recordMaintenance as jest.Mock).mockResolvedValue({
        id: 'new-maint-rec',
        assetId: 'ast-maint-1',
        serviceDate: '2025-03-01T00:00:00.000Z',
        description: 'Replaced cable pulley and lubricated guide rods',
        cost: { amount: 180, currency: 'USD' },
        performedBy: 'Matrix Service Specialists',
      });

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      render(
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <RecordAssetMaintenanceDialog
              asset={mockActiveAsset}
              open={true}
              onOpenChange={onOpenChange}
              onSuccess={onSuccess}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('record-maintenance-dialog')).toBeInTheDocument();
      expect(screen.getByText('Eleiko Olympic Power Rack')).toBeInTheDocument();

      // Enter work order details
      fireEvent.change(screen.getByTestId('maintenance-service-date'), {
        target: { value: '2025-03-01' },
      });
      fireEvent.change(screen.getByTestId('maintenance-performed-by'), {
        target: { value: 'Matrix Service Specialists' },
      });
      fireEvent.change(screen.getByTestId('maintenance-desc-input'), {
        target: { value: 'Replaced cable pulley and lubricated guide rods' },
      });
      fireEvent.change(screen.getByTestId('maintenance-cost-input'), {
        target: { value: '180.00' },
      });
      fireEvent.change(screen.getByTestId('maintenance-notes-input'), {
        target: { value: 'Invoice #INV-2210; warranty claim submitted' },
      });

      // Submit
      fireEvent.click(screen.getByTestId('maintenance-submit-btn'));

      await waitFor(() => {
        expect(assetsApi.recordMaintenance).toHaveBeenCalledWith('ast-maint-1', {
          serviceDate: '2025-03-01',
          description: 'Replaced cable pulley and lubricated guide rods',
          costAmount: 180,
          costCurrency: 'USD',
          performedBy: 'Matrix Service Specialists',
          updateConditionTo: AssetCondition.GOOD,
          notes: 'Invoice #INV-2210; warranty claim submitted',
        });
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });

      // Check cache reconciliation
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-maint-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'list'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-maint-1', 'maintenance'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'assets', 'detail', 'ast-maint-1', 'history'],
      });
    });

    it('2. displays domain auto-recovery hint when servicing DAMAGED equipment', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <RecordAssetMaintenanceDialog
              asset={mockDamagedAsset}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('maintenance-recovery-hint')).toBeInTheDocument();
      expect(screen.getByText(/Automatic Lifecycle Recovery/i)).toBeInTheDocument();
    });

    it('3. prohibits maintenance recording on RETIRED assets per AST-INV-1 and AST-INV-6', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <RecordAssetMaintenanceDialog
              asset={mockRetiredAsset}
              open={true}
              onOpenChange={jest.fn()}
            />
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('maintenance-terminal-alert')).toBeInTheDocument();
      expect(screen.getByText(/AST-INV-1/i)).toBeInTheDocument();
      expect(screen.getByTestId('maintenance-submit-btn')).toBeDisabled();
    });
  });

  describe('AssetMaintenancePage (Authoritative Servicing Ledger)', () => {
    it('1. renders full servicing ledger with work orders and authorized financial figures', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockActiveAsset);
      (assetsApi.getMaintenanceHistory as jest.Mock).mockResolvedValue(mockMaintenanceData);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedManagerSession}>
              <MemoryRouter initialEntries={['/resources/assets/ast-maint-1/maintenance']}>
                <Routes>
                  <Route
                    path="/resources/assets/:id/maintenance"
                    element={<AssetMaintenancePage />}
                  />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/Maintenance & Servicing Ledger: Eleiko Olympic Power Rack/i),
      ).toBeInTheDocument();

      // Metric banner
      expect(screen.getByTestId('total-records-count')).toHaveTextContent('2');

      // Records list
      expect(
        screen.getByText('Replaced Olympic bar J-cups and tightened safety pins'),
      ).toBeInTheDocument();
      expect(screen.getByText('Eleiko Certified Technician')).toBeInTheDocument();

      // Costs visible for authorized manager
      expect(screen.getByText('$250.00')).toBeInTheDocument();
      expect(screen.getByText('$75.00')).toBeInTheDocument();
      expect(screen.queryByTestId('confidential-cost-badge')).not.toBeInTheDocument();
    });

    it('2. protects financial figures with Confidential lock badge when user lacks billing.read', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockActiveAsset);
      (assetsApi.getMaintenanceHistory as jest.Mock).mockResolvedValue(mockMaintenanceData);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={restrictedTechnicianSession}>
              <MemoryRouter initialEntries={['/resources/assets/ast-maint-1/maintenance']}>
                <Routes>
                  <Route
                    path="/resources/assets/:id/maintenance"
                    element={<AssetMaintenancePage />}
                  />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // Confidential badges rendered instead of raw dollar amounts
      const lockBadges = await screen.findAllByTestId('confidential-cost-badge');
      expect(lockBadges.length).toBe(2);
      expect(screen.queryByText('$250.00')).not.toBeInTheDocument();
    });

    it('3. renders empty state when no maintenance records exist', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockActiveAsset);
      (assetsApi.getMaintenanceHistory as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedManagerSession}>
              <MemoryRouter initialEntries={['/resources/assets/ast-maint-1/maintenance']}>
                <Routes>
                  <Route
                    path="/resources/assets/:id/maintenance"
                    element={<AssetMaintenancePage />}
                  />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByTestId('ledger-empty')).toBeInTheDocument();
      expect(screen.getByText(/No servicing work orders logged/i)).toBeInTheDocument();
    });
  });
});

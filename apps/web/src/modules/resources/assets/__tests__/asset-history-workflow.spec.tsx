import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
} from '@kinergy-platform/core';
import type { FixedAssetVM, PaginatedAssetHistoryVM, AssetHistoryEventVM } from '../types';
import { assetsApi } from '../api/assets-api';
import { AssetHistoryPage } from '../routes/asset-history-page';
import { AssetHistoryPreview } from '../components/asset-history-preview';

jest.mock('../api/assets-api', () => ({
  assetsApi: {
    getAsset: jest.fn(),
    getAssetHistory: jest.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const mockAsset: FixedAssetVM = {
  id: 'ast-cardio-01',
  assetTag: 'AST-CARDIO-001',
  name: 'Matrix T75 Commercial Treadmill',
  description: 'Heavy duty running deck',
  category: AssetCategory.GYM_EQUIPMENT,
  purchaseDate: '2025-01-15T00:00:00.000Z',
  purchaseValueAmount: 6500,
  purchaseValueCurrency: 'USD',
  currentEstimatedValueAmount: 5800,
  condition: AssetCondition.GOOD,
  status: AssetStatus.ACTIVE,
  location: {
    facilityId: 'fac-main',
    roomId: 'Cardio Zone A',
    zone: 'Row 3',
  },
  version: 4,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2026-09-04T08:00:00.000Z',
};

const mockHistoryEvents: AssetHistoryEventVM[] = [
  {
    id: 'evt-004',
    assetId: 'ast-cardio-01',
    eventType: AssetHistoryEventType.STATUS_CHANGED,
    description: 'Status changed from UNDER_MAINTENANCE to ACTIVE: Completed preventative service',
    details: {
      priorStatus: AssetStatus.UNDER_MAINTENANCE,
      newStatus: AssetStatus.ACTIVE,
      reason: 'Completed preventative service and load testing',
    },
    recordedByUserId: 'usr-tech-01',
    recordedAt: '2026-09-04T08:00:00.000Z',
  },
  {
    id: 'evt-003',
    assetId: 'ast-cardio-01',
    eventType: AssetHistoryEventType.MAINTENANCE_RECORDED,
    description:
      'Maintenance recorded: Drive belt replacement and motor realignment ($350.00 by Matrix Tech)',
    details: {
      maintenanceRecordId: 'maint-001',
      cost: { amount: 350, currency: 'USD' },
      performedBy: 'Matrix Certified Technician',
      serviceDate: '2026-09-03T14:00:00.000Z',
    },
    recordedByUserId: 'usr-tech-01',
    recordedAt: '2026-09-03T14:30:00.000Z',
  },
  {
    id: 'evt-002',
    assetId: 'ast-cardio-01',
    eventType: AssetHistoryEventType.TRANSFERRED,
    description:
      'Location transferred from [fac-main • Storage] to [fac-main • Cardio Zone A • Row 3]',
    details: {
      priorLocation: { facilityId: 'fac-main', roomId: 'Storage' },
      newLocation: { facilityId: 'fac-main', roomId: 'Cardio Zone A', zone: 'Row 3' },
      reason: 'Gym floor rebalancing deployment',
    },
    recordedByUserId: 'usr-mgr-01',
    recordedAt: '2026-08-10T09:00:00.000Z',
  },
  {
    id: 'evt-001',
    assetId: 'ast-cardio-01',
    eventType: AssetHistoryEventType.CREATED,
    description: 'Asset registered and commissioned at fac-main • Storage',
    details: {
      assetTag: 'AST-CARDIO-001',
      category: AssetCategory.GYM_EQUIPMENT,
      status: AssetStatus.ACTIVE,
      condition: AssetCondition.EXCELLENT,
    },
    recordedByUserId: 'usr-admin-01',
    recordedAt: '2025-01-15T10:00:00.000Z',
  },
];

const mockPaginatedHistory: PaginatedAssetHistoryVM = {
  items: mockHistoryEvents,
  total: 4,
  page: 1,
  limit: 15,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const authorizedFinancialUser: AuthUser = {
  id: 'usr-fin-mgr',
  email: 'fin-mgr@kinergy.io',
  name: 'Finance Manager',
  roles: ['OPERATOR'],
  permissions: ['assets.read', 'billing.read'],
  tenantId: 'tenant-test',
};

const nonFinancialInspector: AuthUser = {
  id: 'usr-floor-staff',
  email: 'staff@kinergy.io',
  name: 'Floor Staff',
  roles: ['STAFF'],
  permissions: ['assets.read'],
  tenantId: 'tenant-test',
};

describe('Asset History & Auditability Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AssetHistoryPage (Authoritative Audit Ledger)', () => {
    it('1. renders chronological lifecycle stream with contextual event decoders', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue(mockPaginatedHistory);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedFinancialUser}>
              <MemoryRouter initialEntries={['/resources/assets/ast-cardio-01/history']}>
                <Routes>
                  <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      // Verify header and equipment title
      expect(
        await screen.findByText(/Lifecycle Audit History: Matrix T75 Commercial Treadmill/i),
      ).toBeInTheDocument();

      // Metric banner
      expect(screen.getByTestId('total-events-count')).toHaveTextContent('4');

      // Verify event badges
      expect(
        screen.getByTestId(`event-badge-${AssetHistoryEventType.STATUS_CHANGED}`),
      ).toHaveTextContent('Status Transition');
      expect(
        screen.getByTestId(`event-badge-${AssetHistoryEventType.MAINTENANCE_RECORDED}`),
      ).toHaveTextContent('Maintenance Serviced');
      expect(
        screen.getByTestId(`event-badge-${AssetHistoryEventType.TRANSFERRED}`),
      ).toHaveTextContent('Relocated');
      expect(screen.getByTestId(`event-badge-${AssetHistoryEventType.CREATED}`)).toHaveTextContent(
        'Commissioned',
      );

      // Verify contextual decoders
      expect(screen.getByTestId('status-transition-context')).toBeInTheDocument();
      expect(screen.getByTestId('transfer-context')).toBeInTheDocument();
      expect(screen.getByTestId('maintenance-context')).toBeInTheDocument();

      // Authorized cost is rendered
      expect(screen.getByText('$350.00')).toBeInTheDocument();

      // Operational reasons are rendered
      expect(
        screen.getByText(/Completed preventative service and load testing/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Gym floor rebalancing deployment/i)).toBeInTheDocument();
    });

    it('2. masks sensitive financial figures with Confidential lock badge when user lacks billing.read', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue(mockPaginatedHistory);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={nonFinancialInspector}>
              <MemoryRouter initialEntries={['/resources/assets/ast-cardio-01/history']}>
                <Routes>
                  <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText(/Lifecycle Audit History: Matrix T75 Commercial Treadmill/i),
      ).toBeInTheDocument();

      // Sensitive maintenance cost should be masked
      expect(screen.queryByText('$350.00')).not.toBeInTheDocument();
      expect(screen.getByTestId('confidential-cost-badge')).toBeInTheDocument();
      expect(screen.getByTestId('confidential-cost-badge')).toHaveTextContent('Confidential');
    });

    it('3. filters events by event type and allows filter resetting', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue(mockPaginatedHistory);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedFinancialUser}>
              <MemoryRouter initialEntries={['/resources/assets/ast-cardio-01/history']}>
                <Routes>
                  <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      await screen.findByText(/Lifecycle Audit History: Matrix T75 Commercial Treadmill/i);

      // Change filter select to TRANSFERRED
      const filterSelect = screen.getByTestId('event-type-filter-select');
      fireEvent.change(filterSelect, {
        target: { value: AssetHistoryEventType.TRANSFERRED },
      });

      await waitFor(() => {
        expect(assetsApi.getAssetHistory).toHaveBeenCalledWith(
          'ast-cardio-01',
          expect.objectContaining({
            eventType: AssetHistoryEventType.TRANSFERRED,
            page: 1,
          }),
        );
      });

      // Reset button should now be visible
      const resetBtn = screen.getByTestId('reset-filter-btn');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(assetsApi.getAssetHistory).toHaveBeenCalledWith(
          'ast-cardio-01',
          expect.objectContaining({
            eventType: undefined,
            page: 1,
          }),
        );
      });
    });

    it('4. displays initial baseline alert when equipment has only its initial commissioning record', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue({
        items: [mockHistoryEvents[3]], // Only CREATED event
        total: 1,
        page: 1,
        limit: 15,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedFinancialUser}>
              <MemoryRouter initialEntries={['/resources/assets/ast-cardio-01/history']}>
                <Routes>
                  <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByTestId('initial-commissioning-notice')).toBeInTheDocument();
      expect(
        screen.getByText(/This equipment currently has only its baseline commissioning entry/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId(`history-item-${mockHistoryEvents[3]!.id}`)).toBeInTheDocument();
    });

    it('5. renders empty state when zero events exist', async () => {
      (assetsApi.getAsset as jest.Mock).mockResolvedValue(mockAsset);
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 15,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedFinancialUser}>
              <MemoryRouter initialEntries={['/resources/assets/ast-cardio-01/history']}>
                <Routes>
                  <Route path="/resources/assets/:id/history" element={<AssetHistoryPage />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByTestId('history-empty')).toBeInTheDocument();
      expect(screen.getByText('No lifecycle events recorded')).toBeInTheDocument();
    });
  });

  describe('AssetHistoryPreview (Detail Cockpit Integration)', () => {
    it('renders preview timeline and navigation link to complete audit history', async () => {
      (assetsApi.getAssetHistory as jest.Mock).mockResolvedValue(mockPaginatedHistory);

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={authorizedFinancialUser}>
              <MemoryRouter>
                <AssetHistoryPreview assetId="ast-cardio-01" />
              </MemoryRouter>
            </AuthProvider>
          </NotificationProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByTestId('asset-history-preview')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /View Complete Audit History \(4\)/i }),
      ).toBeInTheDocument();
    });
  });
});

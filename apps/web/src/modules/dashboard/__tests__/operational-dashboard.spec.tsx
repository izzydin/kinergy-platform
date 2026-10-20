/**
 * Prompt 5 — Operational Dashboard Integration Test Suite
 *
 * Exhaustive verification for the four candidate metrics:
 *  1. Today's Appointments (Truthful Capability Gap)
 *  2. Current Gym Check-ins (Authoritative GET /api/v1/gym/attendance/today)
 *  3. Low-Stock Alerts (Authoritative GET /api/v1/resources/inventory/low-stock)
 *  4. Daily Sales Total (Truthful Capability Gap)
 *
 * Verifies:
 *  - 4 UI states: Loading, Populated, Valid Zero (Empty), Error + Retry
 *  - Independent error isolation between cards
 *  - Permission-aware display and query suppression
 *  - Meaningful navigation destinations without broken links
 */

import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation';
import { BreadcrumbProvider } from '../../../app/breadcrumbs';
import { SlotProvider } from '../../../shared/ui/slots/SlotProvider';

import { attendanceApi } from '../../attendance/api/attendance-api';
import { inventoryApi } from '../../resources/inventory/api/inventory-api';
import { DashboardMetricsSection } from '../components/dashboard-metrics-section';
import {
  GymCheckInsCard,
  LowStockAlertsCard,
  TodayAppointmentsCard,
  DailySalesTotalCard,
} from '../components/operational-metric-cards';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { PaginatedAttendanceResultDTO } from '../../attendance/types';
import { InventoryCategory, InventoryItemStatus } from '../../resources/inventory/types';
import type { InventoryProductVM } from '../../resources/inventory/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Users & Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FULL_ACCESS_USER: AuthUser = {
  id: 'usr-admin-full',
  name: 'Platform Administrator',
  email: 'admin@kinergy.platform',
  roles: ['PLATFORM_ADMIN', 'OWNER'],
  permissions: [
    'gym.attendance.read',
    'attendance.read',
    'inventory.read',
    'sales.read',
    'appointments.read',
  ],
};

const ATTENDANCE_ONLY_USER: AuthUser = {
  id: 'usr-receptionist',
  name: 'Frontdesk Receptionist',
  email: 'reception@kinergy.platform',
  roles: ['RECEPTIONIST'],
  permissions: ['gym.attendance.read', 'attendance.read'],
};

const INVENTORY_ONLY_USER: AuthUser = {
  id: 'usr-kitchen',
  name: 'Kitchen Staff',
  email: 'kitchen@kinergy.platform',
  roles: ['KITCHEN_STAFF'],
  permissions: ['inventory.read'],
};

const UNPRIVILEGED_USER: AuthUser = {
  id: 'usr-guest',
  name: 'Guest Client',
  email: 'guest@kinergy.platform',
  roles: ['CLIENT'],
  permissions: [],
};

const MOCK_ATTENDANCE_POPULATED: PaginatedAttendanceResultDTO = {
  items: [],
  pagination: {
    page: 1,
    limit: 1,
    totalItems: 14,
    totalPages: 14,
    hasNextPage: true,
    hasPreviousPage: false,
  },
  dailySummary: {
    totalCheckIns: 16,
    grantedCount: 14,
    deniedCount: 2,
    uniqueClientsCount: 12,
  },
};

const MOCK_ATTENDANCE_ZERO: PaginatedAttendanceResultDTO = {
  items: [],
  pagination: {
    page: 1,
    limit: 1,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  dailySummary: {
    totalCheckIns: 0,
    grantedCount: 0,
    deniedCount: 0,
    uniqueClientsCount: 0,
  },
};

const MOCK_LOW_STOCK_POPULATED: InventoryProductVM[] = [
  {
    id: 'prod-1',
    sku: 'DRK-001',
    name: 'Electrolyte Splash',
    description: 'Electrolyte drink',
    category: InventoryCategory.HEALTHY_DRINKS,
    unitCost: { amount: 150, currency: 'USD' },
    sellingPrice: { amount: 350, currency: 'USD' },
    currentStock: 2,
    reorderThreshold: 10,
    unitOfMeasure: 'bottle',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    sku: 'SUP-002',
    name: 'Whey Protein Isolate',
    description: 'Protein powder',
    category: InventoryCategory.SUPPLEMENTS,
    unitCost: { amount: 2500, currency: 'USD' },
    sellingPrice: { amount: 4500, currency: 'USD' },
    currentStock: 0,
    reorderThreshold: 5,
    unitOfMeasure: 'tub',
    status: InventoryItemStatus.ACTIVE,
    isLowStock: true,
    isOutOfStock: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

function renderDashboard(
  ui: React.ReactElement,
  {
    user = FULL_ACCESS_USER,
    queryClient = createTestQueryClient(),
  }: { user?: AuthUser; queryClient?: QueryClient } = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider initialSessionOverride={user}>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>{ui}</SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('Antigravity Prompt 5 — Operational Dashboard Acceptance Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Metric 1: Today's Appointments (Documented Capability Gap)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Metric 1: Today Appointments (Authoritative Capability Gap)', () => {
    it('displays truthful Telemetry Pending status without fabricating zero or fake numbers', () => {
      renderDashboard(<TodayAppointmentsCard />);

      expect(screen.getByTestId('appointments-unavailable')).toBeInTheDocument();
      expect(screen.getByText("Today's Appointments")).toBeInTheDocument();
      expect(screen.getByText('Telemetry Pending')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(
        screen.getByText(
          /daily appointment schedule telemetry requires upcoming scheduling service release/i,
        ),
      ).toBeInTheDocument();
    });

    it('does not render broken or dead navigation link for missing appointment service', () => {
      renderDashboard(<TodayAppointmentsCard />);

      const card = screen.getByTestId('appointments-unavailable');
      const links = card.querySelectorAll('a');
      expect(links.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Metric 2: Current Gym Check-ins (GET /api/v1/gym/attendance/today)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Metric 2: Current Gym Check-ins (Authoritative Attendance API)', () => {
    it('STATE 1: Loading — renders skeleton placeholder without displaying fake values', async () => {
      let resolvePromise: (value: PaginatedAttendanceResultDTO) => void;
      const pendingPromise = new Promise<PaginatedAttendanceResultDTO>((resolve) => {
        resolvePromise = resolve;
      });
      jest.spyOn(attendanceApi, 'getTodayAttendance').mockReturnValue(pendingPromise);

      renderDashboard(<GymCheckInsCard />);

      expect(screen.getByTestId('gym-checkins-loading')).toBeInTheDocument();
      expect(screen.queryByText('Gym Check-ins Today')).not.toBeInTheDocument();

      // Cleanup pending promise
      resolvePromise!(MOCK_ATTENDANCE_POPULATED);
    });

    it('STATE 2: Populated — renders granted admissions count, unique clients, and link to /attendance', async () => {
      jest.spyOn(attendanceApi, 'getTodayAttendance').mockResolvedValue(MOCK_ATTENDANCE_POPULATED);

      renderDashboard(<GymCheckInsCard />);

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-populated')).toBeInTheDocument();
      });

      expect(screen.getByText('14')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText(/12 unique clients \(16 total attempts\)/i)).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /view attendance log/i });
      expect(link).toHaveAttribute('href', '/attendance');
    });

    it('STATE 3: Empty (Valid Zero) — displays legitimate zero with Quiet badge and /attendance destination', async () => {
      jest.spyOn(attendanceApi, 'getTodayAttendance').mockResolvedValue(MOCK_ATTENDANCE_ZERO);

      renderDashboard(<GymCheckInsCard />);

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-empty')).toBeInTheDocument();
      });

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('Quiet')).toBeInTheDocument();
      expect(screen.getByText('0 admissions recorded today')).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /view attendance log/i });
      expect(link).toHaveAttribute('href', '/attendance');
    });

    it('STATE 4: Error — displays error message and working retry action', async () => {
      const getTodaySpy = jest
        .spyOn(attendanceApi, 'getTodayAttendance')
        .mockRejectedValueOnce(new Error('Gateway timeout accessing attendance ledger.'))
        .mockResolvedValueOnce(MOCK_ATTENDANCE_POPULATED);

      const onRetry = jest.fn();
      renderDashboard(<GymCheckInsCard onRetry={onRetry} />);

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Gateway timeout accessing attendance ledger.')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry fetching/i });
      fireEvent.click(retryBtn);

      expect(onRetry).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-populated')).toBeInTheDocument();
      });
      expect(getTodaySpy).toHaveBeenCalledTimes(2);
    });

    it('Permission Policy: suppresses query and hides card when user lacks gym.attendance.read', async () => {
      const getTodaySpy = jest.spyOn(attendanceApi, 'getTodayAttendance');

      renderDashboard(<GymCheckInsCard />, { user: INVENTORY_ONLY_USER });

      expect(screen.queryByTestId('gym-checkins-populated')).not.toBeInTheDocument();
      expect(screen.queryByTestId('gym-checkins-loading')).not.toBeInTheDocument();
      expect(screen.queryByText('Gym Check-ins Today')).not.toBeInTheDocument();
      expect(getTodaySpy).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Metric 3: Low-Stock Alerts (GET /api/v1/resources/inventory/low-stock)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Metric 3: Low-Stock Alerts (Authoritative Inventory API)', () => {
    it('STATE 1: Loading — renders skeleton placeholder without displaying fake values', async () => {
      let resolvePromise: (value: InventoryProductVM[]) => void;
      const pendingPromise = new Promise<InventoryProductVM[]>((resolve) => {
        resolvePromise = resolve;
      });
      jest.spyOn(inventoryApi, 'getLowStock').mockReturnValue(pendingPromise);

      renderDashboard(<LowStockAlertsCard />);

      expect(screen.getByTestId('low-stock-loading')).toBeInTheDocument();
      expect(screen.queryByText('Low-Stock Alerts')).not.toBeInTheDocument();

      resolvePromise!(MOCK_LOW_STOCK_POPULATED);
    });

    it('STATE 2: Populated — renders deficit item count, Action Needed badge, and link to /resources/inventory/low-stock', async () => {
      jest.spyOn(inventoryApi, 'getLowStock').mockResolvedValue(MOCK_LOW_STOCK_POPULATED);

      renderDashboard(<LowStockAlertsCard />);

      await waitFor(() => {
        expect(screen.getByTestId('low-stock-populated')).toBeInTheDocument();
      });

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Action Needed')).toBeInTheDocument();
      expect(screen.getByText(/1 out of stock, replenishment required/i)).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /manage low stock/i });
      expect(link).toHaveAttribute('href', '/resources/inventory/low-stock');
    });

    it('STATE 3: Empty (Valid Zero / Healthy) — displays legitimate zero with Healthy badge and link to inventory', async () => {
      jest.spyOn(inventoryApi, 'getLowStock').mockResolvedValue([]);

      renderDashboard(<LowStockAlertsCard />);

      await waitFor(() => {
        expect(screen.getByTestId('low-stock-empty')).toBeInTheDocument();
      });

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('All inventory above reorder threshold')).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /view low stock inventory/i });
      expect(link).toHaveAttribute('href', '/resources/inventory/low-stock');
    });

    it('STATE 4: Error — displays error message and working retry action', async () => {
      const getLowStockSpy = jest
        .spyOn(inventoryApi, 'getLowStock')
        .mockRejectedValueOnce(new Error('Internal database error querying stock items.'))
        .mockResolvedValueOnce(MOCK_LOW_STOCK_POPULATED);

      const onRetry = jest.fn();
      renderDashboard(<LowStockAlertsCard onRetry={onRetry} />);

      await waitFor(() => {
        expect(screen.getByTestId('low-stock-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Internal database error querying stock items.')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry fetching/i });
      fireEvent.click(retryBtn);

      expect(onRetry).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByTestId('low-stock-populated')).toBeInTheDocument();
      });
      expect(getLowStockSpy).toHaveBeenCalledTimes(2);
    });

    it('Permission Policy: suppresses query and hides card when user lacks inventory.read', async () => {
      const getLowStockSpy = jest.spyOn(inventoryApi, 'getLowStock');

      renderDashboard(<LowStockAlertsCard />, { user: ATTENDANCE_ONLY_USER });

      expect(screen.queryByTestId('low-stock-populated')).not.toBeInTheDocument();
      expect(screen.queryByTestId('low-stock-loading')).not.toBeInTheDocument();
      expect(screen.queryByText('Low-Stock Alerts')).not.toBeInTheDocument();
      expect(getLowStockSpy).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Metric 4: Daily Sales Total (Authoritative Capability Gap)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Metric 4: Daily Sales Total (Authoritative Capability Gap)', () => {
    it('displays truthful Aggregation Pending status without client-side summing or fake revenue', () => {
      renderDashboard(<DailySalesTotalCard />);

      expect(screen.getByTestId('sales-unavailable')).toBeInTheDocument();
      expect(screen.getByText('Daily Sales Total')).toBeInTheDocument();
      expect(screen.getByText('Aggregation Pending')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(
        screen.getByText(
          /authoritative daily revenue aggregation endpoint scheduled for upcoming billing milestone/i,
        ),
      ).toBeInTheDocument();
    });

    it('provides navigation link to authorized /sales overview page', () => {
      renderDashboard(<DailySalesTotalCard />);

      const link = screen.getByRole('link', { name: /view sales overview hub/i });
      expect(link).toHaveAttribute('href', '/sales');
    });

    it('Permission Policy: hides card when user lacks sales.read', () => {
      renderDashboard(<DailySalesTotalCard />, { user: UNPRIVILEGED_USER });

      expect(screen.queryByTestId('sales-unavailable')).not.toBeInTheDocument();
      expect(screen.queryByText('Daily Sales Total')).not.toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-Card Integration & Independent Error Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Multi-Card Integration & Error Isolation', () => {
    it('one failed metric does NOT hide other successful metrics (attendance fails, inventory succeeds)', async () => {
      jest
        .spyOn(attendanceApi, 'getTodayAttendance')
        .mockRejectedValue(new Error('Attendance gateway down.'));
      jest.spyOn(inventoryApi, 'getLowStock').mockResolvedValue(MOCK_LOW_STOCK_POPULATED);

      renderDashboard(<DashboardMetricsSection />);

      // Attendance card shows error with retry
      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Attendance gateway down.')).toBeInTheDocument();

      // Low-stock card renders populated normally
      expect(screen.getByTestId('low-stock-populated')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();

      // Unaffected cards render normally
      expect(screen.getByTestId('appointments-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('sales-unavailable')).toBeInTheDocument();
    });

    it('renders all 4 cards in populated operational state when all queries succeed', async () => {
      jest.spyOn(attendanceApi, 'getTodayAttendance').mockResolvedValue(MOCK_ATTENDANCE_POPULATED);
      jest.spyOn(inventoryApi, 'getLowStock').mockResolvedValue(MOCK_LOW_STOCK_POPULATED);

      renderDashboard(<DashboardMetricsSection />);

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-populated')).toBeInTheDocument();
      });
      expect(screen.getByTestId('low-stock-populated')).toBeInTheDocument();
      expect(screen.getByTestId('appointments-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('sales-unavailable')).toBeInTheDocument();
    });

    it('unprivileged user only sees permissible operational cards without leaking sensitive data', async () => {
      const getTodaySpy = jest.spyOn(attendanceApi, 'getTodayAttendance');
      const getLowStockSpy = jest.spyOn(inventoryApi, 'getLowStock');

      renderDashboard(<DashboardMetricsSection />, { user: UNPRIVILEGED_USER });

      // No unauthorized queries were fired
      expect(getTodaySpy).not.toHaveBeenCalled();
      expect(getLowStockSpy).not.toHaveBeenCalled();

      // Restricted cards are omitted
      expect(screen.queryByTestId('gym-checkins-populated')).not.toBeInTheDocument();
      expect(screen.queryByTestId('low-stock-populated')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sales-unavailable')).not.toBeInTheDocument();
    });
  });
});

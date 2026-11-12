import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardOverviewPage } from '../routes/dashboard-overview-page';
import {
  extractPaymentMinorUnitsCents,
  formatMinorUnitsAsCurrency,
  getTodayOperationalBusinessDay,
} from '../api/operational-dashboard-queries';
import { attendanceApi } from '../../gym/attendance/api/attendance-api';
import { inventoryApi } from '../../resources/inventory/api/inventory-api';
import { schedulingApi } from '../../scheduling/api/scheduling-api';
import { salesApi } from '../../sales/api/sales-api';
import { useAuth } from '../../../app/providers/auth-provider';
import { SlotProvider } from '../../../shared/ui/slots/SlotProvider';
import { InventoryItemStatus, InventoryCategory } from '../../resources/inventory/types';
import type { PaymentSummaryDTO } from '../../sales/types';

jest.mock('../../gym/attendance/api/attendance-api', () => ({
  attendanceApi: {
    getToday: jest.fn(),
  },
}));

jest.mock('../../resources/inventory/api/inventory-api', () => ({
  inventoryApi: {
    getLowStock: jest.fn(),
  },
}));

jest.mock('../../scheduling/api/scheduling-api', () => ({
  schedulingApi: {
    listAppointments: jest.fn(),
  },
}));

jest.mock('../../sales/api/sales-api', () => ({
  salesApi: {
    listPayments: jest.fn(),
    listSales: jest.fn(),
  },
}));

jest.mock('../../../app/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const mockedAttendanceApi = attendanceApi as jest.Mocked<typeof attendanceApi>;
const mockedInventoryApi = inventoryApi as jest.Mocked<typeof inventoryApi>;
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;
const mockedSalesApi = salesApi as jest.Mocked<typeof salesApi>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function mockAuthenticatedRole(options: { roles: string[]; permissions: string[] }) {
  mockedUseAuth.mockReturnValue({
    isAuthenticated: true,
    isBootstrapping: false,
    currentUser: {
      id: 'usr-test',
      email: 'staff@kinergy.platform',
      name: 'Staff Member',
      roles: options.roles,
      permissions: options.permissions,
      tenantId: 'default',
    },
    hasPermission: (perm: string) => {
      if (options.permissions.includes('*')) return true;
      const norm = perm.replace(/:/g, '.');
      return options.permissions.some((p) => p.replace(/:/g, '.') === norm);
    },
    hasRole: (role: string) => options.roles.some((r) => r.toUpperCase() === role.toUpperCase()),
  } as unknown as ReturnType<typeof useAuth>);
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <SlotProvider>
          <DashboardOverviewPage />
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Operational Business Dashboard (/dashboard)', () => {
  const businessDay = getTodayOperationalBusinessDay();

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthenticatedRole({
      roles: ['OWNER'],
      permissions: ['*'],
    });

    mockedAttendanceApi.getToday.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 5,
        totalItems: 4,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      dailySummary: {
        totalCheckIns: 4,
        grantedCount: 3,
        deniedCount: 1,
        uniqueClientsCount: 3,
      },
    });

    mockedInventoryApi.getLowStock.mockResolvedValue([
      {
        id: 'inv-1',
        sku: 'KINE-TAPE-01',
        name: 'Kinesiology Tape Pro Roll',
        description: 'Elastic therapeutic tape',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: { amount: 6.5, currency: 'USD' },
        sellingPrice: { amount: 14.0, currency: 'USD' },
        currentStock: 0,
        reorderThreshold: 10,
        unitOfMeasure: 'roll',
        status: InventoryItemStatus.ACTIVE,
        isLowStock: true,
        isOutOfStock: true,
        createdAt: businessDay.startIso,
        updatedAt: businessDay.startIso,
      },
      {
        id: 'inv-2',
        sku: 'SUP-WHEY-01',
        name: 'Whey Isolate Recovery Shake',
        description: 'Post-workout isolate',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: { amount: 25, currency: 'USD' },
        sellingPrice: { amount: 45, currency: 'USD' },
        currentStock: 4,
        reorderThreshold: 10,
        unitOfMeasure: 'tub',
        status: InventoryItemStatus.ACTIVE,
        isLowStock: true,
        isOutOfStock: false,
        createdAt: businessDay.startIso,
        updatedAt: businessDay.startIso,
      },
    ]);

    mockedSchedulingApi.listAppointments.mockResolvedValue([
      {
        id: 'appt-1',
        status: 'CONFIRMED',
        type: 'INITIAL_EVALUATION',
        clientId: 'client-1',
        clientName: 'Elena Rostova',
        therapistId: 'therapist-1',
        therapistName: 'Trainer Alex',
        roomId: 'Room A',
        startTime: `${businessDay.dateStr}T10:00:00.000Z`,
        endTime: `${businessDay.dateStr}T11:00:00.000Z`,
        durationMinutes: 60,
        version: 1,
        createdAt: businessDay.startIso,
        updatedAt: businessDay.startIso,
      },
      {
        id: 'appt-2',
        status: 'SCHEDULED',
        type: 'REHABILITATION',
        clientId: 'client-2',
        clientName: 'Marcus Vance',
        therapistId: 'therapist-1',
        therapistName: 'Trainer Alex',
        roomId: 'Room B',
        startTime: `${businessDay.dateStr}T14:00:00.000Z`,
        endTime: `${businessDay.dateStr}T15:00:00.000Z`,
        durationMinutes: 60,
        version: 1,
        createdAt: businessDay.startIso,
        updatedAt: businessDay.startIso,
      },
      {
        id: 'appt-3',
        status: 'CANCELLED',
        type: 'TREATMENT',
        clientId: 'client-3',
        clientName: 'Cancelled Patient',
        therapistId: 'therapist-1',
        therapistName: 'Trainer Alex',
        roomId: 'Room A',
        startTime: `${businessDay.dateStr}T16:00:00.000Z`,
        endTime: `${businessDay.dateStr}T17:00:00.000Z`,
        durationMinutes: 60,
        cancellationReason: 'Client rescheduled',
        version: 1,
        createdAt: businessDay.startIso,
        updatedAt: businessDay.startIso,
      },
    ]);

    mockedSalesApi.listPayments.mockResolvedValue({
      items: [
        {
          id: 'pay-1',
          saleId: 'sale-1',
          method: 'CARD',
          amount: { amount: 128.5, currency: 'USD', cents: 12850 },
          amountValue: 128.5,
          status: 'COMPLETED',
          reference: 'CARD-001',
          paidAt: `${businessDay.dateStr}T11:15:00.000Z`,
          createdAt: `${businessDay.dateStr}T11:14:00.000Z`,
        },
        {
          id: 'pay-2',
          saleId: 'sale-2',
          method: 'CASH',
          amount: { amount: 55.0, currency: 'USD', cents: 5500 },
          amountValue: 55.0,
          status: 'COMPLETED',
          reference: 'CASH-002',
          paidAt: `${businessDay.dateStr}T13:30:00.000Z`,
          createdAt: `${businessDay.dateStr}T13:29:00.000Z`,
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    mockedSalesApi.listSales.mockResolvedValue({
      items: [
        {
          id: 'sale-pending-99112233',
          clientId: 'client-2',
          currency: 'USD',
          status: 'PENDING_PAYMENT',
          subtotalAmount: 65,
          discountTotalAmount: 0,
          totalAmount: 65,
          subtotal: { amount: 65, currency: 'USD', cents: 6500 },
          discountTotal: { amount: 0, currency: 'USD', cents: 0 },
          total: { amount: 65, currency: 'USD', cents: 6500, formatted: '$65.00' },
          itemCount: 2,
          createdAt: `${businessDay.dateStr}T12:00:00.000Z`,
          updatedAt: `${businessDay.dateStr}T12:00:00.000Z`,
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  describe('1. Removal of Development & Simulation Content', () => {
    it('does not render 4-State UI Simulator controls, System Health, Recent Platform Activity, or Quick System Check', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-value')).toBeInTheDocument();
      });

      expect(screen.queryByText(/4-State UI Simulator/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /state: success/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /state: loading/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /state: empty/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /state: error/i })).not.toBeInTheDocument();

      expect(
        screen.queryByText(/System Health & Notification Infrastructure/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Track A Architectural Validation/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Platform Architect Operator/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /trigger info toast/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /trigger error toast/i }),
      ).not.toBeInTheDocument();

      expect(screen.queryByText(/Recent Platform Activity/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tenant #42/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /quick system check/i })).not.toBeInTheDocument();
    });
  });

  describe('2. Four Core Operational KPI Cards', () => {
    it('renders Gym Check-ins Today, Low-Stock Alerts, Today Appointments, and Daily Sales Total from real APIs', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-value')).toHaveTextContent('3');
      });

      expect(screen.getByText(/3 unique client\(s\) · 1 denied/i)).toBeInTheDocument();
      expect(screen.getByTestId('gym-checkins-link')).toHaveAttribute('href', '/gym/attendance');

      expect(screen.getByTestId('low-stock-value')).toHaveTextContent('2');
      expect(screen.getByText('1 Out of Stock')).toBeInTheDocument();
      expect(screen.getByTestId('low-stock-link')).toHaveAttribute(
        'href',
        '/resources/inventory/low-stock',
      );

      // Active appointments excludes the CANCELLED appointment (2 active out of 3 total)
      expect(screen.getByTestId('appointments-value')).toHaveTextContent('2');
      expect(screen.getByTestId('appointments-breakdown')).toHaveTextContent(
        /1 confirmed\/in-clinic · 1 unconfirmed · 1 cancelled/i,
      );
      expect(screen.getByTestId('appointments-link')).toHaveAttribute('href', '/scheduling');

      // Daily sales total sums completed payments ($128.50 + $55.00 = $183.50)
      expect(screen.getByTestId('daily-sales-value')).toHaveTextContent('$183.50');
      expect(screen.getByTestId('daily-sales-subtitle')).toHaveTextContent(
        'Collected across 2 completed payment(s) today',
      );
      expect(screen.getByTestId('daily-sales-link')).toHaveAttribute('href', '/sales/payments');
    });

    it('renders clean zero states when no check-ins, low-stock items, appointments, or settled payments exist', async () => {
      mockedAttendanceApi.getToday.mockResolvedValue({
        items: [],
        pagination: {
          page: 1,
          limit: 5,
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
      });
      mockedInventoryApi.getLowStock.mockResolvedValue([]);
      mockedSchedulingApi.listAppointments.mockResolvedValue([]);
      mockedSalesApi.listPayments.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      mockedSalesApi.listSales.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-value')).toHaveTextContent('0');
      });

      expect(screen.getByText('No check-ins recorded today')).toBeInTheDocument();
      expect(screen.getByTestId('low-stock-value')).toHaveTextContent('0');
      expect(screen.getByText('All active inventory items stocked')).toBeInTheDocument();
      expect(screen.getByTestId('appointments-value')).toHaveTextContent('0');
      expect(screen.getByText('No appointments scheduled today')).toBeInTheDocument();
      expect(screen.getByTestId('daily-sales-value')).toHaveTextContent('$0.00');
      expect(screen.getByText('No settled payments recorded today')).toBeInTheDocument();
      expect(screen.getByTestId('todays-schedule-empty')).toBeInTheDocument();
      expect(screen.getByTestId('needs-attention-empty')).toBeInTheDocument();
    });

    it('isolates KPI error states and supports retry without crashing sibling cards', async () => {
      mockedAttendanceApi.getToday.mockRejectedValueOnce(new Error('Attendance service timeout'));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-error')).toBeInTheDocument();
      });

      // Sibling cards still load and display their persisted metrics
      expect(await screen.findByTestId('low-stock-value')).toHaveTextContent('2');
      expect(await screen.findByTestId('appointments-value')).toHaveTextContent('2');
      expect(await screen.findByTestId('daily-sales-value')).toHaveTextContent('$183.50');

      // Retry recovers the failed card
      const retryBtn = screen.getByTestId('gym-checkins-error').querySelector('button')!;
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('gym-checkins-value')).toHaveTextContent('3');
      });
    });
  });

  describe('3. Integer Minor-Unit Monetary Aggregation & Payment Filtering', () => {
    it('avoids IEEE-754 floating-point drift (e.g. $19.99 + $35.01 + $0.10 + $0.20)', () => {
      const payments: PaymentSummaryDTO[] = [
        {
          id: 'p1',
          saleId: 's1',
          method: 'CARD',
          amount: { amount: 19.99, currency: 'USD' },
          amountValue: 19.99,
          status: 'COMPLETED',
          reference: null,
          paidAt: `${businessDay.dateStr}T09:00:00.000Z`,
          createdAt: `${businessDay.dateStr}T09:00:00.000Z`,
        },
        {
          id: 'p2',
          saleId: 's2',
          method: 'CARD',
          amount: { amount: 0.1, currency: 'USD' },
          amountValue: 0.1,
          status: 'COMPLETED',
          reference: null,
          paidAt: `${businessDay.dateStr}T09:05:00.000Z`,
          createdAt: `${businessDay.dateStr}T09:05:00.000Z`,
        },
        {
          id: 'p3',
          saleId: 's3',
          method: 'CASH',
          amount: { amount: 0.2, currency: 'USD' },
          amountValue: 0.2,
          status: 'COMPLETED',
          reference: null,
          paidAt: `${businessDay.dateStr}T09:10:00.000Z`,
          createdAt: `${businessDay.dateStr}T09:10:00.000Z`,
        },
      ];

      const totalCents = payments.reduce((sum, p) => sum + extractPaymentMinorUnitsCents(p), 0);
      expect(totalCents).toBe(2029);
      expect(formatMinorUnitsAsCurrency(totalCents, 'USD')).toBe('$20.29');
    });

    it('excludes PENDING, FAILED, and CANCELLED payments or payments settled outside today', async () => {
      mockedSalesApi.listPayments.mockResolvedValue({
        items: [
          {
            id: 'pay-settled-today',
            saleId: 'sale-1',
            method: 'CARD',
            amount: { amount: 75.25, currency: 'USD', cents: 7525 },
            amountValue: 75.25,
            status: 'COMPLETED',
            reference: 'SETTLED-1',
            paidAt: `${businessDay.dateStr}T10:00:00.000Z`,
            createdAt: `${businessDay.dateStr}T10:00:00.000Z`,
          },
          {
            id: 'pay-pending',
            saleId: 'sale-2',
            method: 'CASH',
            amount: { amount: 500.0, currency: 'USD', cents: 50000 },
            amountValue: 500.0,
            status: 'PENDING',
            reference: null,
            paidAt: null,
            createdAt: `${businessDay.dateStr}T10:30:00.000Z`,
          },
          {
            id: 'pay-outside-day',
            saleId: 'sale-3',
            method: 'CARD',
            amount: { amount: 250.0, currency: 'USD', cents: 25000 },
            amountValue: 250.0,
            status: 'COMPLETED',
            reference: 'YESTERDAY',
            paidAt: '2020-01-01T10:00:00.000Z',
            createdAt: '2020-01-01T10:00:00.000Z',
          },
        ],
        total: 3,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('daily-sales-value')).toHaveTextContent('$75.25');
      });
      expect(screen.getByTestId('daily-sales-subtitle')).toHaveTextContent(
        'Collected across 1 completed payment(s) today',
      );
    });
  });

  describe("4. Today's Schedule, Needs Attention & Quick Actions", () => {
    it('renders Today Schedule chronologically with client name, service type, staff, and status without exposing clinical notes', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('todays-schedule-list')).toBeInTheDocument();
      });

      expect(screen.getByTestId('schedule-item-appt-1')).toHaveTextContent('Elena Rostova');
      expect(screen.getByTestId('schedule-item-appt-1')).toHaveTextContent('Initial Evaluation');
      expect(screen.getByTestId('schedule-item-appt-1')).toHaveTextContent('Staff: Trainer Alex');
      expect(screen.getByTestId('schedule-item-appt-1')).toHaveTextContent('Confirmed');

      // Cancelled appointment is excluded from Today's active schedule list
      expect(screen.queryByTestId('schedule-item-appt-3')).not.toBeInTheDocument();
    });

    it('renders Needs Attention items for low stock, unconfirmed appointments, and pending-payment sales', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('needs-attention-list')).toBeInTheDocument();
      });

      expect(screen.getByTestId('attention-group-inventory')).toHaveTextContent(
        'Kinesiology Tape Pro Roll',
      );
      expect(screen.getByTestId('attention-group-appointments')).toHaveTextContent('Marcus Vance');
      expect(screen.getByTestId('attention-group-sales')).toHaveTextContent(
        'Order #sale-pen · $65.00',
      );
    });
  });

  describe('5. Role-Based Visibility & Financial Authorization Boundaries', () => {
    it('restricts Daily Sales Total, Gym Check-ins, and Today Schedule for Kitchen Staff (Inventory operator)', async () => {
      mockAuthenticatedRole({
        roles: ['KITCHEN_STAFF'],
        permissions: [
          'inventory.read',
          'inventory.write',
          'sales.read',
          'sales.create',
          'payments.create',
          'receipts.read',
        ],
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('low-stock-value')).toHaveTextContent('2');
      });

      // Role badge reflects Inventory & Stock Operations
      expect(screen.getByTestId('dashboard-role-badge')).toHaveTextContent(
        'Inventory & Stock Operations',
      );

      // Financial KPI, Gym Check-ins, and Appointments are hidden and their APIs are not called
      expect(screen.queryByTestId('metric-card-daily-sales')).not.toBeInTheDocument();
      expect(screen.queryByTestId('metric-card-gym-checkins')).not.toBeInTheDocument();
      expect(screen.queryByTestId('metric-card-appointments')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-todays-schedule')).not.toBeInTheDocument();
      expect(mockedSalesApi.listPayments).not.toHaveBeenCalled();
      expect(mockedAttendanceApi.getToday).not.toHaveBeenCalled();
      expect(mockedSchedulingApi.listAppointments).not.toHaveBeenCalled();

      // Quick actions show Receive Inventory and Create Sale, but not Register Client or Create Appointment
      expect(screen.getByTestId('quick-action-receive-inventory')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-create-sale')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-action-register-client')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quick-action-create-appointment')).not.toBeInTheDocument();
    });
  });
});

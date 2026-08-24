import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { AttendancePage } from '../attendance/routes/attendance-page';
import {
  AccessResult,
  CheckInMethod,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  PaginatedAttendanceVM,
  RecordCheckInResponseVM,
} from '../attendance/types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layer
jest.mock('../attendance/api/attendance-api', () => ({
  attendanceApi: {
    searchClients: jest.fn(),
    checkEligibility: jest.fn(),
    recordCheckIn: jest.fn(),
    getToday: jest.fn(),
    getClientHistory: jest.fn(),
    searchAttendance: jest.fn(),
  },
}));

const mockedAttendanceApi = jest.mocked(attendanceApi);

const MOCK_RECEPTIONIST_USER: AuthUser = {
  id: 'usr_reception_1',
  email: 'reception@kinergy.io',
  name: 'Desk Receptionist',
  roles: ['Receptionist'],
  permissions: ['attendance.create', 'attendance.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_CLIENT_RESULTS: ClientSearchResultDTO[] = [
  {
    id: 'cli_sarah123',
    fullName: 'Sarah Connor',
    email: 'sarah@resistance.io',
    status: 'ACTIVE',
    phone: '555-0199',
  },
  {
    id: 'cli_john456',
    fullName: 'John Connor',
    email: 'john@resistance.io',
    status: 'ACTIVE',
    phone: '555-0198',
  },
];

const MOCK_ELIGIBILITY_GRANTED: MembershipEligibilityDTO = {
  clientId: 'cli_sarah123',
  isEligible: true,
  outcome: 'GRANTED',
  membershipId: 'mem_sarah_01',
  planId: 'STD_MONTHLY',
  period: {
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-31T00:00:00.000Z',
    durationDays: 30,
  },
  evaluatedAt: '2026-08-24T12:00:00.000Z',
  reason: null,
};

const MOCK_ELIGIBILITY_EXPIRED: MembershipEligibilityDTO = {
  clientId: 'cli_john456',
  isEligible: false,
  outcome: 'MEMBERSHIP_EXPIRED',
  membershipId: 'mem_john_01',
  planId: 'STD_MONTHLY',
  period: {
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-07-01T00:00:00.000Z',
    durationDays: 30,
  },
  evaluatedAt: '2026-08-24T12:00:00.000Z',
  reason: 'Membership expired on 2026-07-01',
};

const MOCK_TODAY_ATTENDANCE: PaginatedAttendanceVM = {
  items: [
    {
      id: 'att_01',
      clientId: 'cli_sarah123',
      membershipId: 'mem_sarah_01',
      checkInTime: '2026-08-24T08:15:00.000Z',
      gymDay: '2026-08-24',
      facilityId: 'fac_main',
      method: CheckInMethod.MANUAL_RECEPTION,
      result: AccessResult.GRANTED,
      gateId: 'turnstile_main',
      receptionistId: 'usr_reception_1',
      notes: 'VIP pass',
    },
    {
      id: 'att_02',
      clientId: 'cli_john456',
      membershipId: 'mem_john_01',
      checkInTime: '2026-08-24T08:30:00.000Z',
      gymDay: '2026-08-24',
      facilityId: 'fac_main',
      method: CheckInMethod.QR_CODE,
      result: AccessResult.DENIED_EXPIRED,
      gateId: 'turnstile_main',
      receptionistId: null,
      notes: null,
    },
  ],
  pagination: {
    page: 1,
    limit: 15,
    totalItems: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  dailySummary: {
    totalCheckIns: 2,
    grantedCount: 1,
    deniedCount: 1,
    uniqueClientsCount: 2,
  },
};

const MOCK_CLIENT_HISTORY: PaginatedAttendanceVM = {
  items: [
    {
      id: 'att_01',
      clientId: 'cli_sarah123',
      membershipId: 'mem_sarah_01',
      checkInTime: '2026-08-24T08:15:00.000Z',
      gymDay: '2026-08-24',
      facilityId: 'fac_main',
      method: CheckInMethod.MANUAL_RECEPTION,
      result: AccessResult.GRANTED,
      gateId: 'turnstile_main',
      receptionistId: 'usr_reception_1',
      notes: null,
    },
    {
      id: 'att_00',
      clientId: 'cli_sarah123',
      membershipId: 'mem_sarah_01',
      checkInTime: '2026-08-22T09:00:00.000Z',
      gymDay: '2026-08-22',
      facilityId: 'fac_main',
      method: CheckInMethod.QR_CODE,
      result: AccessResult.GRANTED,
      gateId: 'turnstile_main',
      receptionistId: null,
      notes: null,
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    totalItems: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  clientStats: {
    totalVisits: 24,
    firstVisitAt: '2026-01-15T08:00:00.000Z',
    lastVisitAt: '2026-08-24T08:15:00.000Z',
  },
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAttendanceApp(
  initialEntries = ['/gym/attendance'],
  authUser: AuthUser = MOCK_RECEPTIONIST_USER,
  queryClient = createTestQueryClient(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/gym/attendance',
        element: <AttendancePage />,
      },
    ],
    { initialEntries },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={authUser}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Phase 5.7-H: Attendance & Reception Frontend Workflows Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAttendanceApi.getToday.mockResolvedValue(MOCK_TODAY_ATTENDANCE);
    mockedAttendanceApi.searchClients.mockResolvedValue(MOCK_CLIENT_RESULTS);
    mockedAttendanceApi.getClientHistory.mockResolvedValue(MOCK_CLIENT_HISTORY);
  });

  // =========================================================================
  // 1. Client Search & Selection
  // =========================================================================
  describe('1. Member Search & Selection', () => {
    it('searches client by query and selects member from autocomplete dropdown', async () => {
      renderAttendanceApp();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'Sarah' } });

      await waitFor(() => {
        expect(mockedAttendanceApi.searchClients).toHaveBeenCalledWith('Sarah');
      });

      await waitFor(() => {
        expect(screen.getByTestId('client-search-item-cli_sarah123')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('client-search-item-cli_sarah123'));

      // Verify member selected
      await waitFor(() => {
        expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      });
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    it('clears selection to allow scanning a new member', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue(MOCK_ELIGIBILITY_GRANTED);
      renderAttendanceApp();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'Sarah' } });

      await waitFor(() => {
        expect(screen.getByTestId('client-search-item-cli_sarah123')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('client-search-item-cli_sarah123'));

      await waitFor(() => {
        expect(screen.getByTestId('clear-client-selection-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('clear-client-selection-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('client-search-input')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. Authoritative Membership Eligibility Display
  // =========================================================================
  describe('2. Authoritative Membership Eligibility Display', () => {
    it('presents backend granted status and contract period directly without client-side calculation', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue(MOCK_ELIGIBILITY_GRANTED);
      renderAttendanceApp();

      // Type directly and submit
      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_sarah123' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(
        '✓ ELIGIBLE TO ENTER',
      );
      expect(screen.getByText('mem_sarah_01')).toBeInTheDocument();
      expect(screen.getByText('STD_MONTHLY')).toBeInTheDocument();
    });

    it('displays expired membership outcome with denial explanation', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue(MOCK_ELIGIBILITY_EXPIRED);
      renderAttendanceApp();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_john456' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(
        '✕ MEMBERSHIP EXPIRED',
      );
      expect(screen.getByText(/membership expired on 2026-07-01/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Check-In Action & In-Flight Duplicate Protection
  // =========================================================================
  describe('3. Check-In Admission Flow', () => {
    it('records check-in, disables button during mutation, and renders admission banner', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue(MOCK_ELIGIBILITY_GRANTED);
      const checkInResponse: RecordCheckInResponseVM = {
        isGranted: true,
        outcome: 'GRANTED',
        attendanceId: 'att_new_99',
        clientId: 'cli_sarah123',
        membershipId: 'mem_sarah_01',
        planId: 'STD_MONTHLY',
        checkInTime: '2026-08-24T12:05:00.000Z',
        gymDay: {
          localDate: '2026-08-24',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_1',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      };

      mockedAttendanceApi.recordCheckIn.mockResolvedValue(checkInResponse);

      renderAttendanceApp();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_sarah123' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_sarah123',
            method: CheckInMethod.MANUAL_RECEPTION,
            gateId: 'turnstile_main',
            idempotencyKey: expect.stringMatching(/^web_desk_cli_sarah123_/),
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('check-in-result-banner')).toBeInTheDocument();
      });
      expect(screen.getByText(/admission granted/i)).toBeInTheDocument();
      expect(screen.getByText(/Attendance ID: att_new_99/i)).toBeInTheDocument();
    });

    it('handles duplicate check-in operational warning gracefully', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue(MOCK_ELIGIBILITY_GRANTED);
      const duplicateResponse: RecordCheckInResponseVM = {
        isGranted: false,
        outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
        attendanceId: null,
        clientId: 'cli_sarah123',
        membershipId: 'mem_sarah_01',
        planId: 'STD_MONTHLY',
        checkInTime: '2026-08-24T12:05:00.000Z',
        gymDay: {
          localDate: '2026-08-24',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_1',
        isDuplicate: true,
        isIdempotentReplay: false,
        denialReason: 'Duplicate check-in within cooldown window',
      };

      mockedAttendanceApi.recordCheckIn.mockResolvedValue(duplicateResponse);

      renderAttendanceApp();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_sarah123' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-result-banner')).toBeInTheDocument();
      });
      expect(screen.getByText(/duplicate check-in warning/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Today's Live Attendance Feed & Real-Time KPIs
  // =========================================================================
  describe("4. Today's Live Attendance Feed & Real-Time KPIs", () => {
    it('renders daily KPI metrics and live attendance feed with server date semantics', async () => {
      renderAttendanceApp();

      await waitFor(() => {
        expect(screen.getByTestId('kpi-total-scans')).toHaveTextContent('2');
      });

      expect(screen.getByTestId('kpi-granted-entries')).toHaveTextContent('1');
      expect(screen.getByTestId('kpi-denied-attempts')).toHaveTextContent('1');
      expect(screen.getByTestId('kpi-unique-visitors')).toHaveTextContent('2');

      // Table rows
      expect(screen.getByTestId('attendance-row-att_01')).toBeInTheDocument();
      expect(screen.getByTestId('attendance-row-att_02')).toBeInTheDocument();
      expect(screen.getByTestId('attendance-result-badge-granted')).toBeInTheDocument();
      expect(screen.getByTestId('attendance-result-badge-expired')).toBeInTheDocument();
    });

    it('filters today feed by result outcome', async () => {
      renderAttendanceApp();

      await waitFor(() => {
        expect(screen.getByTestId('filter-result-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('filter-result-select'), {
        target: { value: AccessResult.GRANTED },
      });

      await waitFor(() => {
        expect(mockedAttendanceApi.getToday).toHaveBeenCalledWith(
          expect.objectContaining({ result: AccessResult.GRANTED }),
        );
      });
    });
  });

  // =========================================================================
  // 5. Client Attendance History Inspection
  // =========================================================================
  describe('5. Client Attendance History Dialog', () => {
    it('opens client history modal from today table and displays visit statistics', async () => {
      renderAttendanceApp();

      await waitFor(() => {
        expect(screen.getByTestId('inspect-history-btn-cli_sarah123')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inspect-history-btn-cli_sarah123'));

      await waitFor(() => {
        expect(screen.getByTestId('client-attendance-history-dialog')).toBeInTheDocument();
      });

      expect(mockedAttendanceApi.getClientHistory).toHaveBeenCalledWith(
        'cli_sarah123',
        expect.anything(),
      );

      await waitFor(() => {
        expect(screen.getByTestId('stats-total-visits')).toHaveTextContent('24');
      });

      expect(screen.getByTestId('history-row-att_01')).toBeInTheDocument();
      expect(screen.getByTestId('history-row-att_00')).toBeInTheDocument();
    });
  });
});

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../../app/providers/notification-provider';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import { attendanceApi } from '../api/attendance-api';
import { AttendancePage } from '../routes/attendance-page';
import {
  AccessResult,
  CheckInMethod,
  ClientSearchResultDTO,
  MembershipEligibilityDTO,
  MembershipEligibilityOutcome,
  PaginatedAttendanceVM,
  RecordCheckInResponseVM,
} from '../types';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layer
jest.mock('../api/attendance-api', () => ({
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
  id: 'usr_desk_01',
  email: 'desk@kinergy.io',
  name: 'Front Desk Officer',
  roles: ['Receptionist'],
  permissions: ['attendance.create', 'attendance.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_main',
};

const MOCK_EMPTY_FEED: PaginatedAttendanceVM = {
  items: [],
  pagination: {
    page: 1,
    limit: 15,
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAdmissionDesk(
  initialEntries = ['/gym/attendance'],
  user: AuthUser = MOCK_RECEPTIONIST_USER,
) {
  const queryClient = createTestQueryClient();
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
      <AuthProvider initialSessionOverride={user}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Milestone 6.2: Reception Admission Desk Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAttendanceApi.getToday.mockResolvedValue(MOCK_EMPTY_FEED);
  });

  // =========================================================================
  // 1. Fast Member Lookup
  // =========================================================================
  describe('1. Member Lookup & Search States', () => {
    it('debounces search input and populates autocomplete dropdown', async () => {
      const mockResults: ClientSearchResultDTO[] = [
        {
          id: 'cli_alex',
          fullName: 'Alex Murphy',
          email: 'alex@kinergy.io',
          status: 'ACTIVE',
        },
      ];
      mockedAttendanceApi.searchClients.mockResolvedValue(mockResults);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      expect(searchInput).toHaveFocus();

      fireEvent.change(searchInput, { target: { value: 'Alex' } });

      await waitFor(() => {
        expect(mockedAttendanceApi.searchClients).toHaveBeenCalledWith('Alex');
      });

      await waitFor(() => {
        expect(screen.getByTestId('client-search-dropdown')).toBeInTheDocument();
      });

      expect(screen.getByText('Alex Murphy')).toBeInTheDocument();
      expect(screen.getByText(/cli_alex/)).toBeInTheDocument();
    });

    it('selects client from dropdown and reveals eligibility section', async () => {
      const mockResults: ClientSearchResultDTO[] = [
        {
          id: 'cli_bruce',
          fullName: 'Bruce Wayne',
          email: 'bruce@waynecorp.io',
          status: 'ACTIVE',
        },
      ];
      mockedAttendanceApi.searchClients.mockResolvedValue(mockResults);
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_bruce',
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_vip_99',
        planId: 'VIP_UNLIMITED',
        period: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-12-31T23:59:59.000Z',
        },
        evaluatedAt: '2026-10-26T14:00:00.000Z',
        reason: null,
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'Bruce' } });

      await waitFor(() => {
        expect(screen.getByTestId('client-search-item-cli_bruce')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('client-search-item-cli_bruce'));

      expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      expect(screen.getByText('Bruce Wayne')).toBeInTheDocument();
      expect(screen.getByTestId('admission-action-container')).toBeInTheDocument();
    });

    it('displays empty state when query returns no results', async () => {
      mockedAttendanceApi.searchClients.mockResolvedValue([]);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'UnknownGuy' } });

      await waitFor(() => {
        expect(screen.getByText(/No matching client found for “UnknownGuy”/i)).toBeInTheDocument();
      });
    });

    it('displays error alert when client search API fails', async () => {
      mockedAttendanceApi.searchClients.mockRejectedValue(new Error('Network connectivity lost'));

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'FailingQuery' } });

      await waitFor(() => {
        expect(screen.getByTestId('search-error-alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/Network connectivity lost/i)).toBeInTheDocument();
    });

    it('clears selection when Change Member is clicked and restores focus', async () => {
      mockedAttendanceApi.searchClients.mockResolvedValue([
        {
          id: 'cli_diana',
          fullName: 'Diana Prince',
          email: 'diana@amazon.io',
          status: 'ACTIVE',
        },
      ]);
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_diana',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'Diana' } });

      await waitFor(() => {
        expect(screen.getByTestId('client-search-item-cli_diana')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('client-search-item-cli_diana'));
      expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();

      const clearBtn = screen.getByTestId('clear-client-selection-btn');
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('selected-client-card')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('client-search-input')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Hardware Wedge & Barcode / QR Scanner Input
  // =========================================================================
  describe('2. QR / Barcode Scanner Support', () => {
    it('accepts kinergy://checkin?clientId=... URI from QR scanner', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_qr_pass',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      // Wedge scanner types URI string and fires submit
      fireEvent.change(searchInput, {
        target: { value: 'kinergy://checkin?clientId=cli_qr_pass' },
      });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('selected-client-card')).getByText('Client (cli_qr_pass)'),
      ).toBeInTheDocument();

      // Method selector defaults to QR_CODE because of scanner payload
      expect(screen.getByTestId('check-in-method-select')).toHaveValue(CheckInMethod.QR_CODE);
    });

    it('accepts JSON QR payload: {"clientId":"..."}', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_json_99',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, {
        target: { value: JSON.stringify({ clientId: 'cli_json_99', type: 'CHECK_IN' }) },
      });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('selected-client-card')).getByText('Client (cli_json_99)'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('check-in-method-select')).toHaveValue(CheckInMethod.QR_CODE);
    });

    it('accepts barcode with BAR_ prefix and sets method to BARCODE', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'BAR_CARD_001',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'BAR_CARD_001' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      });
      expect(screen.getByTestId('check-in-method-select')).toHaveValue(CheckInMethod.BARCODE);
    });

    it('rejects invalid or corrupted barcode scan without selecting member', async () => {
      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: '<script>alert(1)</script>' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('scan-error-alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/Unsafe characters detected/i)).toBeInTheDocument();
      expect(screen.queryByTestId('selected-client-card')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Authoritative Eligibility Evaluation
  // =========================================================================
  describe('3. Authoritative Membership Eligibility States', () => {
    it('displays FROZEN membership status with authoritative suspension warning', async () => {
      const frozenEligibility: MembershipEligibilityDTO = {
        clientId: 'cli_frozen',
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: 'mem_frz_1',
        planId: 'STD_ANNUAL',
        period: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-12-31T23:59:59.000Z',
        },
        evaluatedAt: '2026-10-26T14:00:00.000Z',
        reason: 'Membership is currently frozen and access is suspended.',
      };
      mockedAttendanceApi.checkEligibility.mockResolvedValue(frozenEligibility);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_frozen' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('eligibility-status-badge')).toBeInTheDocument();
      });
      expect(screen.getByText(/MEMBERSHIP FROZEN/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Membership is currently frozen and access is suspended/i),
      ).toBeInTheDocument();
    });

    it('displays EXPIRED membership status with expiration date', async () => {
      const expiredEligibility: MembershipEligibilityDTO = {
        clientId: 'cli_expired',
        isEligible: false,
        outcome: MembershipEligibilityOutcome.EXPIRED,
        membershipId: 'mem_exp_1',
        planId: 'STD_MONTHLY',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-01T00:00:00.000Z',
        },
        evaluatedAt: '2026-10-26T14:00:00.000Z',
        reason: 'Membership expired on 2026-09-01T00:00:00.000Z.',
      };
      mockedAttendanceApi.checkEligibility.mockResolvedValue(expiredEligibility);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_expired' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('eligibility-status-badge')).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('eligibility-status-badge')).getByText(/MEMBERSHIP EXPIRED/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Membership expired on 2026-09-01/i)).toBeInTheDocument();
    });

    it('displays NO_MEMBERSHIP when member has no agreement on file', async () => {
      const noMembershipEligibility: MembershipEligibilityDTO = {
        clientId: 'cli_none',
        isEligible: false,
        outcome: MembershipEligibilityOutcome.NO_MEMBERSHIP,
        evaluatedAt: '2026-10-26T14:00:00.000Z',
        reason: 'Client does not have any membership records on file.',
      };
      mockedAttendanceApi.checkEligibility.mockResolvedValue(noMembershipEligibility);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_none' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('eligibility-status-badge')).toBeInTheDocument();
      });
      expect(screen.getByText(/NO ACTIVE MEMBERSHIP/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Reliable Check-In Submission & Edge Cases
  // =========================================================================
  describe('4. Reliable Check-In Submission & Anti-Passback Safeguards', () => {
    it('generates unique idempotency nonce and presents admission granted banner', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_valid_pass',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      const grantedResponse: RecordCheckInResponseVM = {
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_confirmed_42',
        clientId: 'cli_valid_pass',
        membershipId: 'mem_1',
        planId: 'PLAN_MONTHLY',
        checkInTime: '2026-10-26T14:02:00.000Z',
        gymDay: {
          localDate: '2026-10-26',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_desk_01',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      };
      mockedAttendanceApi.recordCheckIn.mockResolvedValue(grantedResponse);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_valid_pass' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      const submitBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_valid_pass',
            idempotencyKey: expect.stringMatching(/^web_desk_cli_valid_pass_/),
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });
      expect(screen.getByText(/Admission Granted/i)).toBeInTheDocument();
      expect(screen.getByText(/Attendance ID: att_confirmed_42/i)).toBeInTheDocument();

      // Next Member button clears desk
      const nextBtn = screen.getByTestId('next-member-btn');
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('selected-client-card')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('client-search-input')).toBeInTheDocument();
    });

    it('handles duplicate check-in response with anti-passback cooldown warning', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_rapid_rescan',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      const duplicateResponse: RecordCheckInResponseVM = {
        isGranted: false,
        outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
        attendanceId: 'att_denied_dup',
        clientId: 'cli_rapid_rescan',
        membershipId: 'mem_1',
        planId: 'PLAN_MONTHLY',
        checkInTime: '2026-10-26T14:03:00.000Z',
        gymDay: {
          localDate: '2026-10-26',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_desk_01',
        isDuplicate: true,
        isIdempotentReplay: false,
        denialReason: 'Duplicate check-in detected within anti-passback cooldown window (300s).',
      };
      mockedAttendanceApi.recordCheckIn.mockResolvedValue(duplicateResponse);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_rapid_rescan' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-duplicate-banner')).toBeInTheDocument();
      });

      expect(screen.getByText(/Duplicate Check-In Warning/i)).toBeInTheDocument();
      expect(
        screen.getByText(/within the 5-minute anti-passback cooldown window/i),
      ).toBeInTheDocument();
      // Crucial: CANNOT be presented as granted!
      expect(screen.queryByTestId('check-in-granted-card')).not.toBeInTheDocument();
      expect(screen.queryByText(/Admission Granted/i)).not.toBeInTheDocument();
    });

    it('never presents backend rejection as admission granted', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_rejected_target',
        isEligible: false,
        outcome: MembershipEligibilityOutcome.EXPIRED,
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      const deniedResponse: RecordCheckInResponseVM = {
        isGranted: false,
        outcome: AccessResult.DENIED_EXPIRED,
        attendanceId: 'att_denied_exp',
        clientId: 'cli_rejected_target',
        membershipId: null,
        planId: null,
        checkInTime: '2026-10-26T14:04:00.000Z',
        gymDay: {
          localDate: '2026-10-26',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_desk_01',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: 'The membership agreement has expired.',
      };
      mockedAttendanceApi.recordCheckIn.mockResolvedValue(deniedResponse);

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_rejected_target' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-rejected-banner')).toBeInTheDocument();
      });

      expect(screen.getByText(/Admission Rejected/i)).toBeInTheDocument();
      expect(screen.queryByTestId('check-in-granted-card')).not.toBeInTheDocument();
    });

    it('preserves form state and displays retry option upon submission failure', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_retry_target',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });
      mockedAttendanceApi.recordCheckIn.mockRejectedValueOnce(
        new Error('HTTP 503: Access Control Bus Busy'),
      );

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_retry_target' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeInTheDocument();
      });

      const notesInput = screen.getByTestId('notes-input');
      fireEvent.change(notesInput, { target: { value: 'First day gym tour' } });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-error-banner')).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('check-in-error-banner')).getByText(
          /HTTP 503: Access Control Bus Busy/i,
        ),
      ).toBeInTheDocument();

      // Form state preserved
      expect(notesInput).toHaveValue('First day gym tour');
      expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();

      // Retry mechanism
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_retry_success',
        clientId: 'cli_retry_target',
        membershipId: 'mem_1',
        planId: 'PLAN_MONTHLY',
        checkInTime: '2026-10-26T14:06:00.000Z',
        gymDay: {
          localDate: '2026-10-26',
          timezone: 'America/New_York',
          facilityId: 'fac_main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_desk_01',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      });

      const retryBtn = screen.getByTestId('retry-check-in-btn');
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });
    });

    it('resets desk selection when Escape key is pressed', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_escape_test',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-10-26T14:00:00.000Z',
      });

      renderAdmissionDesk();

      const searchInput = screen.getByTestId('client-search-input');
      fireEvent.change(searchInput, { target: { value: 'cli_escape_test' } });
      fireEvent.submit(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('selected-client-card')).not.toBeInTheDocument();
      });
    });
  });
});

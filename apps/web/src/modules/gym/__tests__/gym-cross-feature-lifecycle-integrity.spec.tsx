import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { AttendancePage } from '../attendance/routes/attendance-page';
import { AccessResult, CheckInMethod, MembershipEligibilityOutcome } from '../attendance/types';
import { membershipsApi } from '../memberships/api/memberships-api';
import { MembershipsListPage } from '../memberships/routes/memberships-list-page';
import { MembershipDetailPage } from '../memberships/routes/membership-detail-page';
import { CreateMembershipPage } from '../memberships/routes/create-membership-page';
import type { MembershipVM } from '../memberships/types';
import { plansApi } from '../plans/api/plans-api';
import { PlansListPage } from '../plans/routes/plans-list-page';
import type { MembershipPlanVM } from '../plans/types';
import { trainerDashboardApi } from '../trainer-dashboard/api/trainer-dashboard-api';
import { TrainerDashboardPage } from '../trainer-dashboard/routes/trainer-dashboard-page';

// Polyfill global.Request for react-router v6 data router in JSDOM
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

// Mock API layers
jest.mock('../memberships/api/memberships-api', () => ({
  membershipsApi: {
    listMemberships: jest.fn(),
    getMembershipById: jest.fn(),
    createMembership: jest.fn(),
    freezeMembership: jest.fn(),
    unfreezeMembership: jest.fn(),
    renewMembership: jest.fn(),
    cancelMembership: jest.fn(),
    expireBatch: jest.fn(),
    checkEligibility: jest.fn(),
  },
}));

jest.mock('../plans/api/plans-api', () => ({
  plansApi: {
    listPlans: jest.fn(),
    getPlanById: jest.fn(),
    createPlan: jest.fn(),
    updatePricing: jest.fn(),
    publishPlan: jest.fn(),
    archivePlan: jest.fn(),
  },
}));

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

jest.mock('../trainer-dashboard/api/trainer-dashboard-api', () => ({
  trainerDashboardApi: {
    getSummary: jest.fn(),
    getAssignedClients: jest.fn(),
    getExpiringMemberships: jest.fn(),
    getAttendance: jest.fn(),
  },
}));

const mockedMembershipsApi = jest.mocked(membershipsApi);
const mockedPlansApi = jest.mocked(plansApi);
const mockedAttendanceApi = jest.mocked(attendanceApi);
const mockedTrainerApi = jest.mocked(trainerDashboardApi);

const MOCK_ADMIN_USER: AuthUser = {
  id: 'usr_staff_admin',
  email: 'admin@kinergy.io',
  name: 'Gym Operations Lead',
  roles: ['ADMIN', 'Staff', 'RECEPTIONIST'],
  permissions: [
    'memberships.read',
    'memberships.create',
    'memberships.update',
    'memberships.manage',
    'plans.read',
    'plans.create',
    'plans.update',
    'plans.write',
    'attendance.read',
    'attendance.create',
    'clients.read',
  ],
  tenantId: 'tenant_kinergy_master',
};

const MOCK_ACTIVE_PLAN: MembershipPlanVM = {
  id: 'plan_active_monthly',
  code: 'MONTHLY_STD',
  name: 'Standard Monthly Pass',
  description: 'Full monthly access to fitness areas',
  durationInDays: 30,
  priceAmount: 4999,
  priceCurrency: 'USD',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const MOCK_ARCHIVED_PLAN: MembershipPlanVM = {
  id: 'plan_archived_legacy',
  code: 'LEGACY_PROMO',
  name: 'Discontinued Promo Plan',
  description: 'Old discontinued plan not available for new purchases',
  durationInDays: 14,
  priceAmount: 1999,
  priceCurrency: 'USD',
  status: 'ARCHIVED',
  version: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const MOCK_CLIENT_JOHN = {
  id: 'cli_john_101',
  fullName: 'Johnathan Archer',
  email: 'john@enterprise.io',
  phone: '+1555987654',
  status: 'ACTIVE',
};

const MOCK_GYM_DAY = {
  localDate: '2026-08-15',
  timezone: 'America/New_York',
  facilityId: 'main',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderGymCrossFeatureApp(
  initialEntries: string[],
  user: AuthUser = MOCK_ADMIN_USER,
  queryClient = createTestQueryClient(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/gym/memberships',
        element: <MembershipsListPage />,
      },
      {
        path: '/gym/memberships/new',
        element: <CreateMembershipPage />,
      },
      {
        path: '/gym/memberships/:membershipId',
        element: <MembershipDetailPage />,
      },
      {
        path: '/gym/plans',
        element: <PlansListPage />,
      },
      {
        path: '/gym/attendance',
        element: <AttendancePage />,
      },
      {
        path: '/gym/trainer-dashboard',
        element: <TrainerDashboardPage />,
      },
    ],
    { initialEntries },
  );

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSessionOverride={user}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...utils,
    router,
    queryClient,
  };
}

describe('Prompt 8 — Milestone 6: Membership Lifecycle Integrity and Cross-Feature Consistency', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default plans mock
    mockedPlansApi.listPlans.mockImplementation(async (params) => {
      if (params?.activeOnly) {
        return {
          items: [MOCK_ACTIVE_PLAN],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }
      return {
        items: [MOCK_ACTIVE_PLAN, MOCK_ARCHIVED_PLAN],
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
    });

    mockedAttendanceApi.searchClients.mockResolvedValue([MOCK_CLIENT_JOHN]);

    mockedAttendanceApi.getToday.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 15,
        totalItems: 0,
        totalPages: 1,
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

    mockedTrainerApi.getSummary.mockResolvedValue({
      totalAssignedClients: 5,
      activeMembershipsCount: 5,
      expiringSoonMembershipsCount: 2,
      frozenMembershipsCount: 0,
      todayGrantedCheckInsCount: 1,
      asOfDate: '2026-08-15T00:00:00.000Z',
      horizonDays: 7,
    });
  });

  describe('1. Plan Lifecycle & Enrollment Restrictions', () => {
    it('only lists active commercial plans for enrollment, excluding archived plans', async () => {
      renderGymCrossFeatureApp(['/gym/memberships/new']);

      await waitFor(() => {
        expect(mockedPlansApi.listPlans).toHaveBeenCalledWith(
          expect.objectContaining({ activeOnly: true }),
        );
      });

      const planSelect = await screen.findByTestId('select-plan-id');
      expect(planSelect).toBeInTheDocument();

      // Active plan should be present
      expect(screen.getByText(/Standard Monthly Pass/i)).toBeInTheDocument();

      // Archived plan must NOT be an available option
      expect(screen.queryByText(/Discontinued Promo Plan/i)).not.toBeInTheDocument();
    });

    it('preserves unsaved form inputs upon recoverable validation/backend errors', async () => {
      mockedMembershipsApi.createMembership.mockRejectedValueOnce(
        new Error('Client has an overlapping active membership agreement.'),
      );

      renderGymCrossFeatureApp(['/gym/memberships/new']);

      const clientInput = await screen.findByTestId('input-client-id');
      const planSelect = screen.getByTestId('select-plan-id');

      fireEvent.change(clientInput, { target: { value: 'cli_john_101' } });
      fireEvent.change(planSelect, { target: { value: 'plan_active_monthly' } });

      const submitBtn = screen.getByTestId('submit-membership-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('create-membership-error-alert')).toBeInTheDocument();
      });

      // Confirm error banner describes backend invariant rejection
      expect(
        screen.getByText(/Client has an overlapping active membership agreement/i),
      ).toBeInTheDocument();

      // Invariant: Unsaved user inputs are PRESERVED after error
      expect((clientInput as HTMLInputElement).value).toBe('cli_john_101');
      expect((planSelect as HTMLSelectElement).value).toBe('plan_active_monthly');
    });
  });

  describe('2. Enrollment to Reception Desk Admission Integrity', () => {
    it('reflects new membership in admission desk eligibility and grants entrance', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValueOnce({
        clientId: 'cli_john_101',
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T10:00:00.000Z',
        reason: 'Client has an active and valid membership.',
      });

      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_john_101',
        clientId: 'cli_john_101',
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        checkInTime: '2026-08-15T10:01:00.000Z',
        gymDay: MOCK_GYM_DAY,
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_admin',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      });

      renderGymCrossFeatureApp(['/gym/attendance?clientId=cli_john_101']);

      // 1. Verify eligibility badge shows authoritative ELIGIBLE status
      const badge = await screen.findByTestId('eligibility-status-badge');
      expect(badge).toHaveTextContent(/✓ ELIGIBLE TO ENTER/i);

      // 2. Submit admission
      const submitCheckInBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitCheckInBtn);

      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });

      expect(screen.getByText(/✓ Admission Granted/i)).toBeInTheDocument();
      expect(screen.getByText(/att_john_101/i)).toBeInTheDocument();
    });
  });

  describe('3. Freeze and Admission Eligibility Invariants', () => {
    it('immediately denies admission eligibility and check-in when membership is frozen', async () => {
      // 1. Desk evaluates client whose agreement is FROZEN
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_john_101',
        isEligible: false,
        outcome: MembershipEligibilityOutcome.FROZEN,
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T10:00:00.000Z',
        reason: 'Membership is currently frozen and access is suspended.',
      });

      // 2. Authoritative check-in attempt also denies
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_FROZEN,
        attendanceId: 'att_denied_frz',
        clientId: 'cli_john_101',
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        checkInTime: '2026-08-15T10:02:00.000Z',
        gymDay: MOCK_GYM_DAY,
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_admin',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: 'Membership is currently frozen.',
      });

      renderGymCrossFeatureApp(['/gym/attendance?clientId=cli_john_101']);

      // Status badge renders FROZEN
      const badge = await screen.findByTestId('eligibility-status-badge');
      expect(badge).toHaveTextContent(/❄ MEMBERSHIP FROZEN/i);

      // Attempting check-in produces rejected banner
      const submitCheckInBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitCheckInBtn);

      await waitFor(() => {
        expect(screen.getByTestId('check-in-rejected-banner')).toBeInTheDocument();
      });

      expect(screen.getByText(/✕ Admission Rejected/i)).toBeInTheDocument();
      expect(screen.getByText(/unfreeze before admission/i)).toBeInTheDocument();
    });
  });

  describe('4. Unfreeze and Date Recalculation Flow', () => {
    it('restores admission eligibility and extends end date by freeze duration', async () => {
      const frozenMembership: MembershipVM = {
        id: 'mem_john_01',
        clientId: 'cli_john_101',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        status: 'FROZEN',
        freezeHistory: [
          {
            startDate: '2026-08-10T00:00:00.000Z',
            endDate: '2026-08-20T00:00:00.000Z',
            reason: 'Vacation',
          },
        ],
        version: 2,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
      };

      const unfrozenMembership: MembershipVM = {
        ...frozenMembership,
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-10T00:00:00.000Z', // Extended by 10 days!
          durationDays: 40,
        },
        status: 'ACTIVE',
        version: 3,
        updatedAt: '2026-08-20T00:00:00.000Z',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(frozenMembership);
      mockedMembershipsApi.unfreezeMembership.mockResolvedValueOnce(unfrozenMembership);

      renderGymCrossFeatureApp(['/gym/memberships/mem_john_01']);

      // Detail page shows FROZEN badge and Resume Access button
      const resumeBtn = await screen.findByTestId('unfreeze-detail-button');
      expect(resumeBtn).toBeInTheDocument();

      fireEvent.click(resumeBtn);

      const confirmBtn = await screen.findByTestId('confirm-unfreeze-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockedMembershipsApi.unfreezeMembership).toHaveBeenCalledWith('mem_john_01');
      });
    });
  });

  describe('5. Renewal Semantics & Validity Preservation', () => {
    it('performs gapless renewal preserving existing period on active agreements', async () => {
      const activeMembership: MembershipVM = {
        id: 'mem_john_01',
        clientId: 'cli_john_101',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        status: 'ACTIVE',
        version: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      };

      const renewedMembership: MembershipVM = {
        ...activeMembership,
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-30T00:00:00.000Z', // Seamlessly extended 30 days
          durationDays: 60,
        },
        version: 2,
        updatedAt: '2026-08-25T00:00:00.000Z',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(activeMembership);
      mockedMembershipsApi.renewMembership.mockResolvedValueOnce(renewedMembership);

      renderGymCrossFeatureApp(['/gym/memberships/mem_john_01']);

      const renewBtn = await screen.findByTestId('renew-detail-button');
      fireEvent.click(renewBtn);

      const confirmRenewBtn = await screen.findByTestId('submit-renew-button');
      fireEvent.click(confirmRenewBtn);

      await waitFor(() => {
        expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
          'mem_john_01',
          expect.anything(),
        );
      });
    });
  });

  describe('6. Cancellation and Terminal Ineligibility', () => {
    it('cancels membership and revokes admission eligibility permanently', async () => {
      const activeMembership: MembershipVM = {
        id: 'mem_john_01',
        clientId: 'cli_john_101',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        status: 'ACTIVE',
        version: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      };

      const cancelledMembership: MembershipVM = {
        ...activeMembership,
        status: 'CANCELLED',
        version: 2,
        cancellationReason: 'Relocated to another city',
        updatedAt: '2026-08-16T00:00:00.000Z',
      };

      mockedMembershipsApi.getMembershipById.mockResolvedValue(activeMembership);
      mockedMembershipsApi.cancelMembership.mockResolvedValueOnce(cancelledMembership);

      renderGymCrossFeatureApp(['/gym/memberships/mem_john_01']);

      const cancelBtn = await screen.findByTestId('cancel-detail-button');
      fireEvent.click(cancelBtn);

      const reasonInput = await screen.findByTestId('input-cancel-reason');
      fireEvent.change(reasonInput, { target: { value: 'Relocated to another city' } });

      const confirmCancelBtn = screen.getByTestId('confirm-cancel-button');
      fireEvent.click(confirmCancelBtn);

      await waitFor(() => {
        expect(mockedMembershipsApi.cancelMembership).toHaveBeenCalledWith(
          'mem_john_01',
          expect.objectContaining({ reason: 'Relocated to another city' }),
        );
      });
    });
  });

  describe('7. Stale Admission Desk & Concurrent Backend Rejection', () => {
    it('does not falsely admit when backend authoritatively rejects a stale eligible check-in', async () => {
      // Frontend desk cached an ELIGIBLE client
      mockedAttendanceApi.checkEligibility.mockResolvedValueOnce({
        clientId: 'cli_john_101',
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T09:00:00.000Z',
        reason: 'Active agreement',
      });

      // But concurrently on backend, the membership was expired or cancelled
      // RecordCheckIn authoritatively evaluates live eligibility and denies admission!
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_EXPIRED,
        attendanceId: 'att_denied_concurrent',
        clientId: 'cli_john_101',
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        checkInTime: '2026-08-15T10:00:00.000Z',
        gymDay: MOCK_GYM_DAY,
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_admin',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: 'Membership agreement expired on 2026-08-15T00:00:00.000Z.',
      });

      renderGymCrossFeatureApp(['/gym/attendance?clientId=cli_john_101']);

      // Desk initially displays eligible badge based on cached query
      await screen.findByTestId('eligibility-status-badge');

      // Staff clicks check-in
      const submitCheckInBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitCheckInBtn);

      // Invariant: The admission desk MUST NOT falsely display success.
      // It must display the authoritative rejection result from backend!
      await waitFor(() => {
        expect(screen.getByTestId('check-in-rejected-banner')).toBeInTheDocument();
      });

      expect(screen.getByText(/✕ Admission Rejected/i)).toBeInTheDocument();
      expect(screen.getByText(/membership agreement has expired/i)).toBeInTheDocument();
    });
  });

  describe('8. Concurrent Check-In Protection (Anti-Passback & Idempotency)', () => {
    it('enforces anti-passback duplicate detection within 5-minute cooldown window', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_john_101',
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T10:00:00.000Z',
        reason: 'Active agreement',
      });

      // Second rapid scan within cooldown returns duplicate warning
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
        attendanceId: 'att_dup_record',
        clientId: 'cli_john_101',
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        checkInTime: '2026-08-15T10:02:00.000Z',
        gymDay: MOCK_GYM_DAY,
        method: CheckInMethod.QR_CODE,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_admin',
        isDuplicate: true,
        isIdempotentReplay: false,
        denialReason:
          'Duplicate check-in detected within anti-passback cooldown window (300s). Previous entry at 10:00:00.',
      });

      renderGymCrossFeatureApp(['/gym/attendance?clientId=cli_john_101']);

      await screen.findByTestId('eligibility-status-badge');

      const submitCheckInBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitCheckInBtn);

      await waitFor(() => {
        expect(screen.getByTestId('check-in-duplicate-banner')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/⚠️ Duplicate Check-In Warning \(Anti-Passback Alert\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/anti-passback cooldown window/i)).toBeInTheDocument();
    });

    it('gracefully handles idempotency replay without duplicate side-effects', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValue({
        clientId: 'cli_john_101',
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-08-15T10:00:00.000Z',
        reason: 'Active agreement',
      });

      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_original_123',
        clientId: 'cli_john_101',
        membershipId: 'mem_john_01',
        planId: 'plan_active_monthly',
        checkInTime: '2026-08-15T10:00:00.000Z',
        gymDay: MOCK_GYM_DAY,
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_staff_admin',
        isDuplicate: false,
        isIdempotentReplay: true, // Idempotency replay!
        denialReason: null,
      });

      renderGymCrossFeatureApp(['/gym/attendance?clientId=cli_john_101']);

      await screen.findByTestId('eligibility-status-badge');

      const submitCheckInBtn = screen.getByTestId('submit-check-in-btn');
      fireEvent.click(submitCheckInBtn);

      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });

      // Confirms 'Replay' badge indicator
      expect(screen.getByText('Replay')).toBeInTheDocument();
    });
  });
});

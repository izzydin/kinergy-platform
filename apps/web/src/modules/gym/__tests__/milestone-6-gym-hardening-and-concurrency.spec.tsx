import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation/navigation-provider';
import { BreadcrumbProvider } from '../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../shared/ui/slots';
import { AppRouter } from '../../../app/routes/app-router';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import { attendanceApi } from '../attendance/api/attendance-api';
import { membershipsApi } from '../memberships/api/memberships-api';
import { plansApi } from '../plans/api/plans-api';
import { trainerDashboardApi } from '../trainer-dashboard/api/trainer-dashboard-api';
import { AccessResult, CheckInMethod, RecordCheckInResponseVM } from '../attendance/types';

// Configure testing-library async timeouts for JSDOM
configure({ asyncUtilTimeout: 6000 });
jest.setTimeout(25000);

// Polyfill global.Request for react-router v6 in JSDOM
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
    getSummary: jest.fn(),
    searchAttendance: jest.fn(),
  },
}));

jest.mock('../memberships/api/memberships-api', () => ({
  membershipsApi: {
    listMemberships: jest.fn(),
    getMembershipById: jest.fn(),
    createMembership: jest.fn(),
    renewMembership: jest.fn(),
    freezeMembership: jest.fn(),
    unfreezeMembership: jest.fn(),
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

jest.mock('../trainer-dashboard/api/trainer-dashboard-api', () => ({
  trainerDashboardApi: {
    getSummary: jest.fn(),
    getAssignedClients: jest.fn(),
    getExpiringMemberships: jest.fn(),
    getAttendance: jest.fn(),
  },
}));

const mockedAttendanceApi = jest.mocked(attendanceApi);
const mockedMembershipsApi = jest.mocked(membershipsApi);
const mockedPlansApi = jest.mocked(plansApi);
const mockedTrainerApi = jest.mocked(trainerDashboardApi);

// Test Roles & User Profiles
const MANAGER_USER: AuthUser = {
  id: 'usr_gym_manager',
  email: 'manager@kinergy.io',
  name: 'Gym Operations Manager',
  roles: ['ADMIN', 'Staff'],
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
    'gym.attendance.read',
    'clients.read',
  ],
  tenantId: 'tenant_kinergy_master',
};

const RECEPTIONIST_USER: AuthUser = {
  id: 'usr_reception_desk',
  email: 'reception@kinergy.io',
  name: 'Desk Officer',
  roles: ['Receptionist'],
  permissions: ['attendance.create', 'attendance.read', 'gym.attendance.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const ATTENDANCE_ONLY_USER: AuthUser = {
  id: 'usr_gate_guard',
  email: 'gate@kinergy.io',
  name: 'Gate Guard',
  roles: ['Receptionist'],
  permissions: ['attendance.create', 'attendance.read', 'gym.attendance.read', 'memberships.read'],
  tenantId: 'tenant_kinergy_master',
};

const TRAINER_USER: AuthUser = {
  id: 'usr_trainer_sam',
  email: 'trainer.sam@kinergy.io',
  name: 'Coach Sam',
  roles: ['Trainer'],
  permissions: ['clients.read'],
  tenantId: 'tenant_kinergy_master',
};

const UNAUTHORIZED_USER: AuthUser = {
  id: 'usr_unauthorized',
  email: 'guest@kinergy.io',
  name: 'Guest User',
  roles: ['Guest'],
  permissions: ['guest.read'],
  tenantId: 'tenant_kinergy_master',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAppAtRoute(
  initialEntry: string,
  user: AuthUser = RECEPTIONIST_USER,
  queryClient = createTestQueryClient(),
) {
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

describe('Milestone 6: Gym Reliability, Concurrency, and End-to-End Hardening', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default seed responses
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

    mockedAttendanceApi.searchClients.mockResolvedValue([
      {
        id: 'client_marcus',
        fullName: 'Marcus Vance',
        email: 'marcus@kinergy.io',
        status: 'ACTIVE',
        phone: '+1555123999',
      },
    ]);

    mockedAttendanceApi.checkEligibility.mockResolvedValue({
      clientId: 'client_marcus',
      isEligible: true,
      outcome: 'GRANTED',
      membershipId: 'mem_marcus_01',
      planId: 'PLAN_GOLD',
      period: {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-01T00:00:00.000Z',
        durationDays: 31,
      },
      evaluatedAt: '2026-10-27T10:00:00.000Z',
      reason: null,
    });

    mockedPlansApi.listPlans.mockResolvedValue({
      items: [
        {
          id: 'plan_gold_monthly',
          code: 'GOLD_MONTHLY',
          name: 'Gold Monthly All-Access',
          description: 'Unlimited access',
          durationInDays: 30,
          priceAmount: 8900,
          priceCurrency: 'USD',
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    mockedMembershipsApi.listMemberships.mockResolvedValue({
      items: [
        {
          id: 'mem_marcus_01',
          clientId: 'client_marcus',
          planId: 'plan_gold_monthly',
          period: {
            startDate: '2026-10-01T00:00:00.000Z',
            endDate: '2026-11-01T00:00:00.000Z',
            durationDays: 31,
          },
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    mockedTrainerApi.getSummary.mockResolvedValue({
      totalAssignedClients: 1,
      activeMembershipsCount: 1,
      expiringSoonMembershipsCount: 0,
      frozenMembershipsCount: 0,
      todayGrantedCheckInsCount: 1,
      asOfDate: '2026-10-27',
      horizonDays: 7,
    });

    mockedTrainerApi.getAssignedClients.mockResolvedValue({
      items: [
        {
          membershipId: 'mem_marcus_01',
          clientId: 'client_marcus',
          planId: 'plan_gold_monthly',
          planName: 'Gold Monthly All-Access',
          status: 'ACTIVE',
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-11-01T00:00:00.000Z',
          daysRemaining: 5,
          isExpiringSoon: true,
          isExpired: false,
          isCurrentlyFrozen: false,
          assignedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    mockedTrainerApi.getExpiringMemberships.mockResolvedValue({
      items: [],
      total: 0,
      horizonDays: 7,
    });

    mockedTrainerApi.getAttendance.mockResolvedValue({
      items: [],
      total: 0,
      grantedCount: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  // =========================================================================
  // Section 1: Reception Ingress & Authoritative Eligibility (Journeys 1, 2, 3)
  // =========================================================================
  describe('User Journeys 1, 2, 3: Reception Ingress & Authoritative Eligibility', () => {
    it('Journey 1 & 2: Receptionist verifies authoritative eligibility and grants admission', async () => {
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_marcus_101',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:15:00.000Z',
        gymDay: {
          localDate: '2026-10-27',
          timezone: 'America/Guayaquil',
          facilityId: 'main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      });

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
      });

      // Verify authoritative eligibility badge
      await waitFor(() => {
        expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
      });
      expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(/ELIGIBLE/i);

      // Verify submit button is enabled and click to check-in
      const checkInBtn = screen.getByTestId('submit-check-in-btn');
      expect(checkInBtn).toBeEnabled();
      fireEvent.click(checkInBtn);

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'client_marcus',
            method: CheckInMethod.MANUAL_RECEPTION,
          }),
        );
      });

      // Verify authoritative grant feedback
      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });
      expect(screen.getByText('✓ Admission Granted')).toBeInTheDocument();
    });

    it('Journey 3: Receptionist attempts to check in an ineligible expired member and receives clear rejection', async () => {
      mockedAttendanceApi.checkEligibility.mockResolvedValueOnce({
        clientId: 'client_marcus',
        isEligible: false,
        outcome: 'EXPIRED',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        period: {
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-10-01T00:00:00.000Z',
          durationDays: 30,
        },
        evaluatedAt: '2026-10-27T10:00:00.000Z',
        reason: 'Membership agreement expired on 2026-10-01.',
      });

      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_EXPIRED,
        attendanceId: 'att_audit_denied_1',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:15:00.000Z',
        gymDay: {
          localDate: '2026-10-27',
          timezone: 'America/Guayaquil',
          facilityId: 'main',
        },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: 'Membership agreement expired on 2026-10-01.',
      });

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
      });

      // Shows EXPIRED badge
      await waitFor(() => {
        expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(/EXPIRED/i);
      });

      // Click check in
      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      // Displays understandable rejection message
      await waitFor(() => {
        expect(screen.getByTestId('check-in-rejected-banner')).toBeInTheDocument();
      });
      expect(
        screen.getByText(
          /The membership agreement has expired. Please renew membership before admitting./i,
        ),
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Section 2: Concurrency, Duplicate Submissions & Idempotent Retries (Journey 4)
  // =========================================================================
  describe('User Journey 4: Concurrency, Duplicate Prevention & Idempotency', () => {
    it('Frontend double-submit protection: disables button while mutation is in flight', async () => {
      let resolveCheckIn!: (value: RecordCheckInResponseVM) => void;
      mockedAttendanceApi.recordCheckIn.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCheckIn = resolve;
          }),
      );

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeEnabled();
      });

      // Click once
      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      // Button is immediately disabled with loading text
      expect(screen.getByTestId('submit-check-in-btn')).toBeDisabled();
      expect(screen.getByText(/Recording Admission.../i)).toBeInTheDocument();

      // Click again while disabled — handler must not trigger secondary request
      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledTimes(1);
      });

      // Resolve in-flight request
      resolveCheckIn({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_resolved_1',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:15:00.000Z',
        gymDay: { localDate: '2026-10-27', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      });

      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });
    });

    it('Backend Anti-Passback Duplicate Response: Displays understandable warning when concurrent scan occurred', async () => {
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
        attendanceId: 'att_passback_audit_1',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:15:00.000Z',
        gymDay: { localDate: '2026-10-27', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: true,
        isIdempotentReplay: false,
        denialReason:
          'Duplicate check-in detected within anti-passback cooldown window (300s). Previous entry at 2026-10-27T10:12:00.000Z.',
      });

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeEnabled();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-duplicate-banner')).toBeInTheDocument();
      });

      // Clear duplicate explanation
      expect(
        screen.getByText(
          /Duplicate scan: Check-in was already recorded for this member within the 5-minute anti-passback cooldown window./i,
        ),
      ).toBeInTheDocument();
    });

    it('Ambiguous write timeout recovery: Retrying reuses identical idempotency key and renders Replay confirmation', async () => {
      // 1. Initial attempt fails with network timeout error
      mockedAttendanceApi.recordCheckIn.mockRejectedValueOnce(
        new Error('Network request timed out before receiving server response.'),
      );

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeEnabled();
      });

      // Fill operator note
      fireEvent.change(screen.getByTestId('notes-input'), {
        target: { value: 'Guest pass #42' },
      });

      // Submit check-in
      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      // Error banner with retry button appears
      await waitFor(() => {
        expect(screen.getByTestId('check-in-error-banner')).toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('check-in-error-banner')).getByText(
          /Network request timed out before receiving server response./i,
        ),
      ).toBeInTheDocument();

      // Verify recoverable input is preserved
      expect(screen.getByTestId('notes-input')).toHaveValue('Guest pass #42');

      // Capture first attempt's idempotencyKey
      const firstCallArgs = mockedAttendanceApi.recordCheckIn.mock.calls[0]![0];
      const originalIdempotencyKey = firstCallArgs.idempotencyKey;
      expect(originalIdempotencyKey).toBeDefined();

      // 2. Server committed the write; second call replaying the key returns cached commit
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_cached_idempotent_1',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:15:00.000Z',
        gymDay: { localDate: '2026-10-27', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: false,
        isIdempotentReplay: true,
        denialReason: null,
      });

      // Click "Retry" button
      fireEvent.click(screen.getByTestId('retry-check-in-btn'));

      await waitFor(() => {
        expect(mockedAttendanceApi.recordCheckIn).toHaveBeenCalledTimes(2);
      });

      // VERIFY: The retry sent the exact same idempotency key as the first attempt!
      const retryCallArgs = mockedAttendanceApi.recordCheckIn.mock.calls[1]![0];
      expect(retryCallArgs.idempotencyKey).toBe(originalIdempotencyKey);

      // VERIFY: Displays "Replay" badge rather than duplicate error
      await waitFor(() => {
        expect(screen.getByTestId('check-in-granted-card')).toBeInTheDocument();
      });
      expect(screen.getByText('Replay')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Section 3: Mid-Flight State Invalidation (Journey 5)
  // =========================================================================
  describe('User Journey 5: Membership Changes While Admission Desk is Open', () => {
    it('Authoritative backend evaluation rejects check-in if account was frozen while desk was open', async () => {
      // Admission desk open, initial lookup said eligible
      mockedAttendanceApi.recordCheckIn.mockResolvedValueOnce({
        isGranted: false,
        outcome: AccessResult.DENIED_FROZEN,
        attendanceId: 'att_denied_frozen_1',
        clientId: 'client_marcus',
        membershipId: 'mem_marcus_01',
        planId: 'plan_gold_monthly',
        checkInTime: '2026-10-27T10:16:00.000Z',
        gymDay: { localDate: '2026-10-27', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'turnstile_main',
        receptionistId: 'usr_reception_desk',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: 'Membership is currently suspended under medical freeze.',
      });

      renderAppAtRoute('/gym/attendance?clientId=client_marcus');

      await waitFor(() => {
        expect(screen.getByTestId('submit-check-in-btn')).toBeEnabled();
      });

      fireEvent.click(screen.getByTestId('submit-check-in-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('check-in-rejected-banner')).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          /The membership is currently frozen \/ suspended. Please unfreeze before admission./i,
        ),
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Section 4: Membership Lifecycle & Invariants (Journeys 6, 7, 8)
  // =========================================================================
  describe('User Journeys 6, 7, 8: Plans, Enrollment & Membership Lifecycle', () => {
    it('Journey 6: Plan Archival updates catalog and prohibits new enrollment', async () => {
      mockedPlansApi.archivePlan.mockResolvedValueOnce({
        id: 'plan_gold_monthly',
        code: 'GOLD_MONTHLY',
        name: 'Gold Monthly All-Access',
        description: 'Unlimited access',
        durationInDays: 30,
        priceAmount: 8900,
        priceCurrency: 'USD',
        status: 'ARCHIVED',
        version: 2,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-27T10:00:00.000Z',
      });

      renderAppAtRoute('/gym/plans', MANAGER_USER);

      await waitFor(() => {
        expect(screen.getByText('Gold Monthly All-Access')).toBeInTheDocument();
      });

      // Open row actions and archive
      const actionsBtn = screen.getByRole('button', { name: /Open actions menu/i });
      fireEvent.click(actionsBtn);

      await waitFor(() => {
        expect(screen.getByText('Archive Plan')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Archive Plan'));

      await waitFor(() => {
        expect(screen.getByTestId('archive-plan-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('confirm-archive-plan-button'));

      await waitFor(() => {
        expect(mockedPlansApi.archivePlan).toHaveBeenCalledWith('plan_gold_monthly');
      });
    });

    it('Journey 7: Enrollment fails gracefully and preserves user input on validation error', async () => {
      mockedMembershipsApi.createMembership.mockRejectedValueOnce(
        new Error('Client already holds an active overlapping membership in this period.'),
      );

      renderAppAtRoute('/gym/memberships/new', MANAGER_USER);

      await waitFor(() => {
        expect(screen.getByTestId('create-membership-page')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId('select-plan-id')).not.toBeDisabled();
      });

      // Enter client ID and select plan
      fireEvent.change(screen.getByTestId('input-client-id'), {
        target: { value: 'client_marcus' },
      });
      fireEvent.change(screen.getByTestId('select-plan-id'), {
        target: { value: 'plan_gold_monthly' },
      });

      fireEvent.click(screen.getByTestId('submit-membership-button'));

      // Error banner renders backend domain invariant rejection
      await waitFor(() => {
        expect(
          screen.getByText(/Client already holds an active overlapping membership/i),
        ).toBeInTheDocument();
      });

      // User input is preserved
      expect(screen.getByTestId('input-client-id')).toHaveValue('client_marcus');
    });

    it('Journey 8: Membership Lifecycle — Renew and Freeze operations execute with authoritative invariants', async () => {
      mockedMembershipsApi.renewMembership.mockResolvedValueOnce({
        id: 'mem_marcus_01',
        clientId: 'client_marcus',
        planId: 'plan_gold_monthly',
        period: {
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-12-01T00:00:00.000Z',
          durationDays: 61,
        },
        status: 'ACTIVE',
        version: 2,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-27T10:00:00.000Z',
      });

      renderAppAtRoute('/gym/memberships', MANAGER_USER);

      await waitFor(() => {
        expect(screen.getByText('client_marcus')).toBeInTheDocument();
      });

      // Open action menu and renew
      const actionsBtn = screen.getByRole('button', { name: /Open actions menu/i });
      fireEvent.click(actionsBtn);

      await waitFor(() => {
        expect(screen.getByText('Renew Agreement')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Renew Agreement'));

      await waitFor(() => {
        expect(screen.getByTestId('renew-membership-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('submit-renew-button'));

      await waitFor(() => {
        expect(mockedMembershipsApi.renewMembership).toHaveBeenCalledWith(
          'mem_marcus_01',
          expect.any(Object),
        );
      });
    });
  });

  // =========================================================================
  // Section 5: Authorization, Route Specificity & Consolidation (Journeys 9, 10)
  // =========================================================================
  describe('User Journeys 9 & 10: Authorization Boundaries & Attendance Consolidation', () => {
    it('Journey 9: Trainer with clients.read can access /gym/trainer-dashboard', async () => {
      renderAppAtRoute('/gym/trainer-dashboard', TRAINER_USER);

      await waitFor(() => {
        expect(screen.getByText('Trainer Operational Dashboard')).toBeInTheDocument();
      });
      expect(screen.getByTestId('kpi-banner-container')).toBeInTheDocument();
    });

    it('Journey 9: Trainer lacking memberships.read is blocked from /gym/memberships with 403 Forbidden', async () => {
      renderAppAtRoute('/gym/memberships', TRAINER_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
      });
    });

    it('Journey 10: Consolidated Attendance Route — Canonical /gym/attendance works with attendance.read', async () => {
      renderAppAtRoute('/gym/attendance', ATTENDANCE_ONLY_USER);

      await waitFor(() => {
        expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
      });
      expect(screen.getByText('Gym Admission & Reception')).toBeInTheDocument();
    });

    it('Journey 10: Legacy /attendance compatibility route redirects to /gym/attendance', async () => {
      renderAppAtRoute('/attendance', RECEPTIONIST_USER);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Gym Admission & Reception/i }),
        ).toBeInTheDocument();
      });
    });

    it('Direct route security: Unauthorized user lacking attendance permissions is blocked with 403 Forbidden', async () => {
      renderAppAtRoute('/gym/attendance', UNAUTHORIZED_USER);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
      });
    });
  });
});

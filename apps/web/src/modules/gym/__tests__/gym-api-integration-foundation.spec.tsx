import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpClient } from '../../../shared/api/http-client';
import { attendanceApi } from '../attendance/api/attendance-api';
import { attendanceQueryKeys } from '../attendance/api/attendance-query-keys';
import { useAttendanceSummary, useAttendanceCheckIn } from '../attendance/hooks/use-gym-attendance';
import { AccessResult, CheckInMethod } from '../attendance/types';
import { membershipsApi } from '../memberships/api/memberships-api';
import { membershipsQueryKeys } from '../memberships/api/memberships-query-keys';
import { useMemberSearch, useMembershipMutations } from '../memberships/hooks/use-memberships';
import { plansApi } from '../plans/api/plans-api';
import { plansQueryKeys } from '../plans/api/plans-query-keys';
import { usePlanMutations } from '../plans/hooks/use-plans';
import { trainerDashboardQueryKeys } from '../trainer-dashboard/api/trainer-dashboard-query-keys';
import {
  GymEligibilityError,
  GymDuplicateCheckInError,
  GymMembershipOverlapError,
  GymConcurrencyError,
  GymPlanArchivedError,
  isGymEligibilityRejection,
  isDuplicateCheckIn,
  isMembershipOverlapConflict,
  isGymConcurrencyConflict,
  isPlanArchivedConflict,
  isAuthorizationDenied,
  isGymResourceNotFound,
  normalizeGymError,
  getGymErrorMessage,
} from '../api/gym-error';
import {
  AuthorizationError,
  NotFoundError,
  NetworkError,
  ServerError,
} from '../../../shared/api/api-error';

// Mock http-client
jest.mock('../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

// Mock notification provider
const mockNotifySuccess = jest.fn();
const mockNotifyError = jest.fn();
const mockNotifyWarning = jest.fn();
jest.mock('../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: mockNotifySuccess,
    error: mockNotifyError,
    warning: mockNotifyWarning,
  }),
}));

const mockedHttpClient = jest.mocked(httpClient);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Milestone 6: Gym API Integration Foundation Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Request Paths, Methods, and Payload Serialization
  // =========================================================================
  describe('1. Request Paths & Payload Serialization', () => {
    it('serializes client search request with trimmed query', async () => {
      mockedHttpClient.get.mockResolvedValueOnce([]);
      await attendanceApi.searchClients('  Sarah Connor  ');

      expect(mockedHttpClient.get).toHaveBeenCalledWith('/api/v1/clients/search', {
        params: { q: 'Sarah Connor' },
        signal: undefined,
      });
    });

    it('returns empty array immediately without HTTP call for blank client search', async () => {
      const results = await attendanceApi.searchClients('   ');
      expect(results).toEqual([]);
      expect(mockedHttpClient.get).not.toHaveBeenCalled();
    });

    it('serializes admission eligibility check query parameters', async () => {
      const mockEligibility = {
        clientId: 'cli_01',
        isEligible: true,
        outcome: 'ELIGIBLE',
        evaluatedAt: '2026-08-22T10:00:00.000Z',
      };
      mockedHttpClient.get.mockResolvedValueOnce(mockEligibility);

      const res = await attendanceApi.checkEligibility('cli_01', '2026-08-22T10:00:00.000Z');
      expect(mockedHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/eligibility/check',
        {
          params: { clientId: 'cli_01', asOf: '2026-08-22T10:00:00.000Z' },
          signal: undefined,
        },
      );
      expect(res).toEqual(mockEligibility);
    });

    it('serializes check-in submission with idempotency key and method', async () => {
      const input = {
        clientId: 'cli_01',
        method: CheckInMethod.QR_CODE,
        gateId: 'Gate_A',
        notes: 'VIP fast track',
        idempotencyKey: 'idem_unique_123',
      };
      const mockResponse = {
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_100',
        clientId: 'cli_01',
        membershipId: 'mem_01',
        planId: 'plan_gold',
        checkInTime: '2026-08-22T10:00:00.000Z',
        gymDay: { localDate: '2026-08-22', timezone: 'America/Guayaquil', facilityId: 'main' },
        method: CheckInMethod.QR_CODE,
        gateId: 'Gate_A',
        receptionistId: 'usr_rec_1',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      };
      mockedHttpClient.post.mockResolvedValueOnce(mockResponse);

      const res = await attendanceApi.recordCheckIn(input);
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/attendance/check-in',
        input,
        undefined,
      );
      expect(res.isGranted).toBe(true);
      expect(res.attendanceId).toBe('att_100');
    });

    it('serializes attendance range summary query parameters', async () => {
      mockedHttpClient.get.mockResolvedValueOnce({ totalDays: 7, totalGrantedVisits: 140 });
      await attendanceApi.getSummary({
        startDate: '2026-08-15',
        endDate: '2026-08-22',
        facilityId: 'main',
      });

      expect(mockedHttpClient.get).toHaveBeenCalledWith('/api/v1/gym/attendance/summary', {
        params: {
          startDate: '2026-08-15',
          endDate: '2026-08-22',
          facilityId: 'main',
        },
        signal: undefined,
      });
    });

    it('serializes multi-criteria membership filtering query', async () => {
      mockedHttpClient.get.mockResolvedValueOnce({ items: [], total: 0 });
      await membershipsApi.listMemberships({
        clientId: 'cli_01',
        status: 'ACTIVE',
        startDateFrom: '2026-08-01',
        startDateTo: '2026-08-31',
        page: 2,
        limit: 15,
      });

      expect(mockedHttpClient.get).toHaveBeenCalledWith('/api/v1/gym/memberships', {
        params: {
          clientId: 'cli_01',
          planId: undefined,
          status: 'ACTIVE',
          startDateFrom: '2026-08-01',
          startDateTo: '2026-08-31',
          endDateFrom: undefined,
          endDateTo: undefined,
          page: 2,
          limit: 15,
        },
        signal: undefined,
      });
    });

    it('serializes membership lifecycle commands (renew, freeze, unfreeze, cancel, expireBatch)', async () => {
      // Renew
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'mem_01', status: 'ACTIVE' });
      await membershipsApi.renewMembership('mem_01', {
        newPlanId: 'plan_vip',
        effectiveDate: '2026-09-01T00:00:00.000Z',
      });
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/mem_01/renew',
        { newPlanId: 'plan_vip', effectiveDate: '2026-09-01T00:00:00.000Z' },
        undefined,
      );

      // Freeze
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'mem_01', status: 'FROZEN' });
      await membershipsApi.freezeMembership('mem_01', {
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-15T00:00:00.000Z',
        reason: 'Medical recovery',
      });
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/mem_01/freeze',
        {
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-15T00:00:00.000Z',
          reason: 'Medical recovery',
        },
        undefined,
      );

      // Unfreeze
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'mem_01', status: 'ACTIVE' });
      await membershipsApi.unfreezeMembership('mem_01');
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/mem_01/unfreeze',
        {},
        undefined,
      );

      // Cancel
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'mem_01', status: 'CANCELLED' });
      await membershipsApi.cancelMembership('mem_01', { reason: 'Relocated out of state' });
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/mem_01/cancel',
        { reason: 'Relocated out of state' },
        undefined,
      );

      // Expire Batch
      mockedHttpClient.post.mockResolvedValueOnce({ processedCount: 10, expiredCount: 2 });
      await membershipsApi.expireBatch({ batchSize: 50, dryRun: false });
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/memberships/expire-batch',
        { asOfDate: undefined, batchSize: 50, dryRun: false },
        undefined,
      );
    });

    it('serializes commercial plan creation, pricing patch, publish, and archival', async () => {
      // Create Plan
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'plan_01', status: 'DRAFT' });
      await plansApi.createPlan({
        code: 'GOLD_MONTHLY',
        name: 'Gold Monthly',
        durationInDays: 30,
        priceAmount: 4999, // Integer cents: $49.99
        priceCurrency: 'USD',
      });
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/membership-plans',
        {
          code: 'GOLD_MONTHLY',
          name: 'Gold Monthly',
          durationInDays: 30,
          priceAmount: 4999,
          priceCurrency: 'USD',
        },
        undefined,
      );

      // Update Pricing
      mockedHttpClient.patch.mockResolvedValueOnce({ id: 'plan_01', priceAmount: 5999 });
      await plansApi.updatePricing('plan_01', { priceAmount: 5999, currency: 'USD' });
      expect(mockedHttpClient.patch).toHaveBeenCalledWith(
        '/api/v1/gym/membership-plans/plan_01/pricing',
        { priceAmount: 5999, currency: 'USD' },
        undefined,
      );

      // Publish Plan
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'plan_01', status: 'ACTIVE' });
      await plansApi.publishPlan('plan_01');
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/membership-plans/plan_01/publish',
        {},
        undefined,
      );

      // Archive Plan
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'plan_01', status: 'ARCHIVED' });
      await plansApi.archivePlan('plan_01');
      expect(mockedHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/gym/membership-plans/plan_01/archive',
        {},
        undefined,
      );
    });
  });

  // =========================================================================
  // 2. Query Key Stability, Hierarchy & Prefix Match Invalidation
  // =========================================================================
  describe('2. Query Key Stability & Invalidation Prefix Hierarchy', () => {
    it('verifies attendanceQueryKeys stability and prefix getters', () => {
      expect(attendanceQueryKeys.all).toEqual(['gym', 'attendance']);
      expect(attendanceQueryKeys.todays()).toEqual(['gym', 'attendance', 'today']);
      expect(attendanceQueryKeys.today({ date: '2026-08-22' })).toEqual([
        'gym',
        'attendance',
        'today',
        { date: '2026-08-22' },
      ]);
      expect(attendanceQueryKeys.summaries()).toEqual(['gym', 'attendance', 'summary']);
      expect(attendanceQueryKeys.clientHistories()).toEqual(['gym', 'attendance', 'client']);
      expect(attendanceQueryKeys.clientHistories('cli_01')).toEqual([
        'gym',
        'attendance',
        'client',
        'cli_01',
      ]);
      expect(attendanceQueryKeys.clientHistory('cli_01', { page: 2 })).toEqual([
        'gym',
        'attendance',
        'client',
        'cli_01',
        { page: 2 },
      ]);
      expect(attendanceQueryKeys.eligibilities()).toEqual(['gym', 'attendance', 'eligibility']);
      expect(attendanceQueryKeys.eligibilities('cli_01')).toEqual([
        'gym',
        'attendance',
        'eligibility',
        'cli_01',
      ]);
      expect(attendanceQueryKeys.clientSearches()).toEqual(['gym', 'attendance', 'client-search']);
      expect(attendanceQueryKeys.clientSearch('sarah')).toEqual([
        'gym',
        'attendance',
        'client-search',
        'sarah',
      ]);
    });

    it('verifies membershipsQueryKeys stability and prefix getters', () => {
      expect(membershipsQueryKeys.all).toEqual(['gym', 'memberships']);
      expect(membershipsQueryKeys.lists()).toEqual(['gym', 'memberships', 'list']);
      expect(membershipsQueryKeys.list({ status: 'ACTIVE' })).toEqual([
        'gym',
        'memberships',
        'list',
        { status: 'ACTIVE' },
      ]);
      expect(membershipsQueryKeys.details()).toEqual(['gym', 'memberships', 'detail']);
      expect(membershipsQueryKeys.detail('mem_123')).toEqual([
        'gym',
        'memberships',
        'detail',
        'mem_123',
      ]);
      expect(membershipsQueryKeys.expirings()).toEqual(['gym', 'memberships', 'expiring']);
      expect(membershipsQueryKeys.expiring(14)).toEqual(['gym', 'memberships', 'expiring', 14]);
      expect(membershipsQueryKeys.expireds()).toEqual(['gym', 'memberships', 'expired']);
      expect(membershipsQueryKeys.eligibilities('cli_01')).toEqual([
        'gym',
        'memberships',
        'eligibility',
        'cli_01',
      ]);
      expect(membershipsQueryKeys.clientSearch('sarah')).toEqual([
        'gym',
        'memberships',
        'client-search',
        'sarah',
      ]);
    });

    it('verifies plansQueryKeys stability', () => {
      expect(plansQueryKeys.all).toEqual(['gym', 'plans']);
      expect(plansQueryKeys.lists()).toEqual(['gym', 'plans', 'list']);
      expect(plansQueryKeys.details()).toEqual(['gym', 'plans', 'detail']);
      expect(plansQueryKeys.detail('plan_123')).toEqual(['gym', 'plans', 'detail', 'plan_123']);
    });

    it('verifies trainerDashboardQueryKeys stability and prefix getters', () => {
      expect(trainerDashboardQueryKeys.all).toEqual(['gym', 'trainer-dashboard']);
      expect(trainerDashboardQueryKeys.summaries()).toEqual([
        'gym',
        'trainer-dashboard',
        'summary',
      ]);
      expect(trainerDashboardQueryKeys.assignedClientsList()).toEqual([
        'gym',
        'trainer-dashboard',
        'assigned-clients',
      ]);
      expect(trainerDashboardQueryKeys.expiringMembershipsList()).toEqual([
        'gym',
        'trainer-dashboard',
        'expiring-memberships',
      ]);
      expect(trainerDashboardQueryKeys.attendances()).toEqual([
        'gym',
        'trainer-dashboard',
        'attendance',
      ]);
    });
  });

  // =========================================================================
  // 3. Structured Error Mapping, Type Guards & Sanitization
  // =========================================================================
  describe('3. Error Handling, Classification & Sanitization', () => {
    it('correctly classifies eligibility denials', () => {
      expect(isGymEligibilityRejection({ outcome: 'DENIED_EXPIRED' })).toBe(true);
      expect(isGymEligibilityRejection({ outcome: 'DENIED_FROZEN' })).toBe(true);
      expect(isGymEligibilityRejection({ outcome: 'DENIED_INACTIVE_CLIENT' })).toBe(true);
      expect(isGymEligibilityRejection({ outcome: 'INACTIVE_CLIENT' })).toBe(true);
      expect(isGymEligibilityRejection({ outcome: 'MEMBERSHIP_EXPIRED' })).toBe(true);
      expect(isGymEligibilityRejection({ outcome: 'GRANTED' })).toBe(false);
      expect(isGymEligibilityRejection(new GymEligibilityError('DENIED_FROZEN'))).toBe(true);
    });

    it('correctly classifies duplicate turnstile scans within 5-minute cooldown', () => {
      expect(isDuplicateCheckIn({ outcome: AccessResult.DENIED_DUPLICATE_CHECKIN })).toBe(true);
      expect(isDuplicateCheckIn({ message: 'Duplicate check-in recorded within 5 minutes' })).toBe(
        true,
      );
      expect(isDuplicateCheckIn(new GymDuplicateCheckInError())).toBe(true);
      expect(isDuplicateCheckIn(new Error('Random network timeout'))).toBe(false);
    });

    it('correctly classifies active membership interval overlap conflicts', () => {
      expect(
        isMembershipOverlapConflict({
          message: 'Client already has an active membership covering this date interval.',
        }),
      ).toBe(true);
      expect(isMembershipOverlapConflict(new GymMembershipOverlapError())).toBe(true);
      expect(isMembershipOverlapConflict(new Error('Different failure'))).toBe(false);
    });

    it('correctly classifies optimistic concurrency version mismatch (HTTP 409)', () => {
      expect(isGymConcurrencyConflict({ statusCode: 409, message: 'Version mismatch OCC' })).toBe(
        true,
      );
      expect(isGymConcurrencyConflict({ code: 'CONCURRENT_MODIFICATION' })).toBe(true);
      expect(isGymConcurrencyConflict(new GymConcurrencyError())).toBe(true);
      expect(isGymConcurrencyConflict({ statusCode: 400, message: 'Invalid payload' })).toBe(false);
    });

    it('correctly classifies archived plan operation rejections (ADR-0059)', () => {
      expect(
        isPlanArchivedConflict({
          message: 'Cannot update pricing on an archived membership plan.',
        }),
      ).toBe(true);
      expect(isPlanArchivedConflict(new GymPlanArchivedError())).toBe(true);
      expect(isPlanArchivedConflict(new Error('Unrelated error'))).toBe(false);
    });

    it('correctly classifies authorization failures (403) and not-found (404)', () => {
      expect(isAuthorizationDenied({ statusCode: 403 })).toBe(true);
      expect(isAuthorizationDenied(new AuthorizationError())).toBe(true);
      expect(isAuthorizationDenied({ statusCode: 400 })).toBe(false);

      expect(isGymResourceNotFound({ statusCode: 404 })).toBe(true);
      expect(isGymResourceNotFound(new NotFoundError())).toBe(true);
      expect(isGymResourceNotFound({ statusCode: 500 })).toBe(false);
    });

    it('sanitizes and provides clear, human-friendly messages without leaking sensitive tokens', () => {
      const authErr = new AuthorizationError('Bearer secret_jwt_token_123 failed');
      expect(getGymErrorMessage(authErr)).toBe(
        'You do not possess permission to perform this gym operation.',
      );

      const dupErr = new GymDuplicateCheckInError();
      expect(getGymErrorMessage(dupErr)).toContain('anti-passback cooldown');

      const overlapErr = new GymMembershipOverlapError();
      expect(getGymErrorMessage(overlapErr)).toContain('active membership already covers');

      const archivedErr = new GymPlanArchivedError();
      expect(getGymErrorMessage(archivedErr)).toContain('Cannot modify or publish an archived');

      const occErr = new GymConcurrencyError();
      expect(getGymErrorMessage(occErr)).toContain('updated concurrently by another user');

      const netErr = new NetworkError();
      expect(getGymErrorMessage(netErr)).toContain('Network request failed');

      const serverErr = new ServerError('Database crashed at host 10.0.0.1');
      expect(getGymErrorMessage(serverErr)).toBe(
        'An unexpected server error occurred during gym operation.',
      );
    });

    it('normalizes domain errors and raw exceptions into structured ApiErrors', () => {
      const normalizedDup = normalizeGymError({ outcome: AccessResult.DENIED_DUPLICATE_CHECKIN });
      expect(normalizedDup).toBeInstanceOf(GymDuplicateCheckInError);

      const normalizedOverlap = normalizeGymError(new Error('active membership conflict overlap'));
      expect(normalizedOverlap).toBeInstanceOf(GymMembershipOverlapError);

      const normalizedArchived = normalizeGymError(new Error('Cannot publish archived plan'));
      expect(normalizedArchived).toBeInstanceOf(GymPlanArchivedError);

      const normalizedOcc = normalizeGymError({ statusCode: 409, message: 'version conflict' });
      expect(normalizedOcc).toBeInstanceOf(GymConcurrencyError);

      const normalizedGeneric = normalizeGymError(new Error('Network offline'));
      expect(normalizedGeneric).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Targeted Query Cache Invalidation Lifecycle
  // =========================================================================
  describe('4. Targeted Query Cache Invalidation', () => {
    it('invalidates attendance, eligibility, and trainer queries on successful check-in', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockResponse = {
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_999',
        clientId: 'cli_01',
        membershipId: 'mem_01',
        planId: 'plan_gold',
        checkInTime: '2026-08-22T10:00:00.000Z',
        gymDay: { localDate: '2026-08-22', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.QR_CODE,
        gateId: 'G1',
        receptionistId: 'rec_1',
        isDuplicate: false,
        isIdempotentReplay: false,
        denialReason: null,
      };
      mockedHttpClient.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useAttendanceCheckIn(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          clientId: 'cli_01',
          method: CheckInMethod.QR_CODE,
        });
      });

      expect(mockNotifySuccess).toHaveBeenCalledWith(expect.stringContaining('Check-in granted!'));
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.todays() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.today() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.summaries() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: attendanceQueryKeys.eligibility('cli_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: attendanceQueryKeys.clientHistories('cli_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gym', 'memberships'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gym', 'trainer-dashboard'] });
    });

    it('alerts warning notification without converting duplicate check-in to success', async () => {
      const queryClient = createTestQueryClient();
      const mockResponse = {
        isGranted: false,
        outcome: AccessResult.DENIED_DUPLICATE_CHECKIN,
        attendanceId: null,
        clientId: 'cli_01',
        membershipId: 'mem_01',
        planId: 'plan_gold',
        checkInTime: '2026-08-22T10:00:00.000Z',
        gymDay: { localDate: '2026-08-22', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.QR_CODE,
        gateId: 'G1',
        receptionistId: 'rec_1',
        isDuplicate: true,
        isIdempotentReplay: false,
        denialReason: 'Duplicate check-in within 5 minutes',
      };
      mockedHttpClient.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useAttendanceCheckIn(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          clientId: 'cli_01',
          method: CheckInMethod.QR_CODE,
        });
      });

      expect(mockNotifySuccess).not.toHaveBeenCalled();
      expect(mockNotifyWarning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Access was already recorded for this member within the last 5 minutes',
        ),
      );
    });

    it('notifies idempotent replay on duplicate submission with cached key', async () => {
      const queryClient = createTestQueryClient();
      const mockResponse = {
        isGranted: true,
        outcome: AccessResult.GRANTED,
        attendanceId: 'att_cached_100',
        clientId: 'cli_01',
        membershipId: 'mem_01',
        planId: 'plan_gold',
        checkInTime: '2026-08-22T10:00:00.000Z',
        gymDay: { localDate: '2026-08-22', timezone: 'UTC', facilityId: 'main' },
        method: CheckInMethod.QR_CODE,
        gateId: 'G1',
        receptionistId: 'rec_1',
        isDuplicate: false,
        isIdempotentReplay: true,
        denialReason: null,
      };
      mockedHttpClient.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useAttendanceCheckIn(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          clientId: 'cli_01',
          idempotencyKey: 'idem_key_xyz',
        });
      });

      expect(mockNotifySuccess).toHaveBeenCalledWith(
        expect.stringContaining('Check-in replayed successfully (Idempotent: att_cached_100)'),
      );
    });

    it('invalidates targeted membership, attendance, and trainer queries on membership lifecycle mutations', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMembershipMutations(), {
        wrapper: createWrapper(queryClient),
      });

      // 1. Create Membership
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'mem_new', clientId: 'cli_01' });
      await act(async () => {
        await result.current.createMembership.mutateAsync({
          clientId: 'cli_01',
          planId: 'plan_std',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.lists() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.eligibilities('cli_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['gym', 'attendance', 'eligibility'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gym', 'trainer-dashboard'] });

      invalidateSpy.mockClear();

      // 2. Renew Membership
      mockedHttpClient.post.mockResolvedValueOnce({
        id: 'mem_01',
        clientId: 'cli_01',
        status: 'ACTIVE',
      });
      await act(async () => {
        await result.current.renewMembership.mutateAsync({
          membershipId: 'mem_01',
          input: { newPlanId: 'plan_vip' },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.detail('mem_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.lists() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.expirings() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.expireds() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.eligibilities('cli_01'),
      });

      invalidateSpy.mockClear();

      // 3. Freeze Membership
      mockedHttpClient.post.mockResolvedValueOnce({
        id: 'mem_01',
        clientId: 'cli_01',
        status: 'FROZEN',
      });
      await act(async () => {
        await result.current.freezeMembership.mutateAsync({
          membershipId: 'mem_01',
          input: {
            startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-09-15T00:00:00.000Z',
            reason: 'Injury',
          },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.detail('mem_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.lists() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.eligibilities('cli_01'),
      });

      invalidateSpy.mockClear();

      // 4. Cancel Membership
      mockedHttpClient.post.mockResolvedValueOnce({
        id: 'mem_01',
        clientId: 'cli_01',
        status: 'CANCELLED',
      });
      await act(async () => {
        await result.current.cancelMembership.mutateAsync({
          membershipId: 'mem_01',
          input: { reason: 'Moved abroad' },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.detail('mem_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: membershipsQueryKeys.lists() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: membershipsQueryKeys.eligibilities('cli_01'),
      });
    });

    it('invalidates plan catalog lists and plan details on plan mutations', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => usePlanMutations(), {
        wrapper: createWrapper(queryClient),
      });

      // Update Pricing
      mockedHttpClient.patch.mockResolvedValueOnce({ id: 'plan_01', priceAmount: 6999 });
      await act(async () => {
        await result.current.updatePricing.mutateAsync({
          planId: 'plan_01',
          input: { priceAmount: 6999 },
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: plansQueryKeys.detail('plan_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plansQueryKeys.lists() });

      invalidateSpy.mockClear();

      // Publish Plan
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'plan_01', status: 'ACTIVE' });
      await act(async () => {
        await result.current.publishPlan.mutateAsync('plan_01');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: plansQueryKeys.detail('plan_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plansQueryKeys.lists() });

      invalidateSpy.mockClear();

      // Archive Plan
      mockedHttpClient.post.mockResolvedValueOnce({ id: 'plan_01', status: 'ARCHIVED' });
      await act(async () => {
        await result.current.archivePlan.mutateAsync('plan_01');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: plansQueryKeys.detail('plan_01'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plansQueryKeys.lists() });
    });
  });

  // =========================================================================
  // 5. Query Hooks Integration & Data Flow
  // =========================================================================
  describe('5. Feature Query Hooks Data Flow', () => {
    it('executes useAttendanceSummary query when dates provided', async () => {
      const queryClient = createTestQueryClient();
      const mockSummary = {
        startDate: '2026-08-01',
        endDate: '2026-08-07',
        facilityId: 'main',
        totalDays: 7,
        totalGrantedVisits: 140,
        totalDeniedAttempts: 5,
        totalUniqueVisitors: 80,
        averageDailyVisits: 20,
        dailyBreakdown: [],
      };
      mockedHttpClient.get.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(
        () =>
          useAttendanceSummary({
            startDate: '2026-08-01',
            endDate: '2026-08-07',
          }),
        { wrapper: createWrapper(queryClient) },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSummary);
    });

    it('executes useMemberSearch when query has at least 2 characters', async () => {
      const queryClient = createTestQueryClient();
      const mockClients = [
        { id: 'cli_01', fullName: 'Sarah Connor', email: 'sarah@example.com', status: 'ACTIVE' },
      ];
      mockedHttpClient.get.mockResolvedValueOnce(mockClients);

      const { result } = renderHook(() => useMemberSearch('Sarah'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockClients);
    });

    it('disables useMemberSearch when query is shorter than 2 characters', () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useMemberSearch('S'), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockedHttpClient.get).not.toHaveBeenCalled();
    });
  });
});

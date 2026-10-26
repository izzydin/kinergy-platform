import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { kinesiologyQueryKeys } from '../api/kinesiology-query-keys';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { kinesiologyApi } from '../api/kinesiology-api';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { SessionStatus } from '../types';

jest.mock('../api/kinesiology-api');

const mockKinesiologyApi = kinesiologyApi as jest.Mocked<typeof kinesiologyApi>;

describe('Kinesiology Query Keys and Cache Invalidation Spec', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Query Key Stability and Hierarchy', () => {
    it('produces expected stable query keys across all scopes', () => {
      expect(kinesiologyQueryKeys.all).toEqual(['kinesiology']);
      expect(kinesiologyQueryKeys.sessions()).toEqual(['kinesiology', 'sessions']);
      expect(kinesiologyQueryKeys.session('sess_100')).toEqual([
        'kinesiology',
        'sessions',
        'sess_100',
      ]);
      expect(kinesiologyQueryKeys.sessionNotes('sess_100')).toEqual([
        'kinesiology',
        'sessions',
        'sess_100',
        'notes',
      ]);
      expect(kinesiologyQueryKeys.sessionContext('sess_100')).toEqual([
        'kinesiology',
        'sessions',
        'sess_100',
        'context',
      ]);
      expect(kinesiologyQueryKeys.sessionTherapist('sess_100')).toEqual([
        'kinesiology',
        'sessions',
        'sess_100',
        'therapist',
      ]);
      expect(kinesiologyQueryKeys.histories()).toEqual(['kinesiology', 'history']);
      expect(kinesiologyQueryKeys.history('client_1')).toEqual([
        'kinesiology',
        'history',
        'client_1',
      ]);
      expect(kinesiologyQueryKeys.history('client_1', { page: 1, limit: 10 })).toEqual([
        'kinesiology',
        'history',
        'client_1',
        { page: 1, limit: 10 },
      ]);
    });
  });

  describe('Targeted Mutation Invalidation Rules', () => {
    it('updateNotes sets session data and only invalidates notes and history without touching unrelated scopes', async () => {
      const wrapper = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const updatedSession = {
        id: 'sess_1',
        clientId: 'client_1',
        appointmentId: 'appt_1',
        therapistId: 'therapist_1',
        status: SessionStatus.IN_PROGRESS,
        notes: { subjective: 'Patient reports improved mobility' },
        version: 2,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:30:00.000Z',
      };
      mockKinesiologyApi.updateNotes.mockResolvedValueOnce(updatedSession);

      const { result } = renderHook(() => useTreatmentMutations('sess_1'), { wrapper });

      await act(async () => {
        await result.current.updateNotes.mutateAsync({
          subjective: 'Patient reports improved mobility',
        });
      });

      // Validates targeted query data update
      expect(queryClient.getQueryData(kinesiologyQueryKeys.session('sess_1'))).toEqual(
        updatedSession,
      );

      // Verifies notes and client history are targeted for invalidation
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessionNotes('sess_1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.history('client_1'),
      });

      // Confirms session lists or timeline are NOT invalidated on intermediate note saves
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessions(),
      });
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: ['timeline', 'client_1'],
      });
    });

    it('assignTherapist updates session and invalidates therapist and context keys', async () => {
      const wrapper = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const updatedSession = {
        id: 'sess_1',
        clientId: 'client_1',
        appointmentId: 'appt_1',
        therapistId: 'therapist_2',
        status: SessionStatus.SCHEDULED,
        notes: {},
        version: 2,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:15:00.000Z',
      };
      mockKinesiologyApi.assignTherapist.mockResolvedValueOnce(updatedSession);

      const { result } = renderHook(() => useTreatmentMutations('sess_1'), { wrapper });

      await act(async () => {
        await result.current.assignTherapist.mutateAsync({
          newTherapistId: 'therapist_2',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessionTherapist('sess_1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessionContext('sess_1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessions(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['scheduling'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['appointments'],
      });
    });

    it('cancelSession invalidates context, session list, client history, and cross-feature timeline', async () => {
      const wrapper = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const cancelledSession = {
        id: 'sess_1',
        clientId: 'client_1',
        appointmentId: 'appt_1',
        therapistId: 'therapist_1',
        status: SessionStatus.CANCELLED,
        cancellationReason: 'Client called to cancel',
        notes: {},
        version: 2,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:20:00.000Z',
      };
      mockKinesiologyApi.cancelSession.mockResolvedValueOnce(cancelledSession);

      const { result } = renderHook(() => useTreatmentMutations('sess_1'), { wrapper });

      await act(async () => {
        await result.current.cancelSession.mutateAsync({
          reason: 'Client called to cancel',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessionContext('sess_1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.sessions(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: kinesiologyQueryKeys.history('client_1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['timeline', 'client_1'],
      });
    });
  });
});

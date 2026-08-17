import '@testing-library/jest-dom';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { useTreatmentSession, kinesiologyQueryKeys } from '../hooks/use-treatment-session';
import { kinesiologyApi } from '../api/kinesiology-api';
import { NotificationProvider } from '../../../app/providers/notification-provider';

jest.mock('../api/kinesiology-api');

const mockKinesiologyApi = kinesiologyApi as jest.Mocked<typeof kinesiologyApi>;

describe('Kinesiology Full-Stack Integration Spec', () => {
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

  it('fetches treatment session and caches query result under stable query keys', async () => {
    const sessionData = {
      id: 'sess_integ_1',
      clientId: 'client_alpha',
      appointmentId: 'appt_1',
      therapistId: 'therapist_1',
      status: 'SCHEDULED' as const,
      notes: {},
      version: 1,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };

    mockKinesiologyApi.getSessionById.mockResolvedValueOnce(sessionData);

    const { result } = renderHook(() => useTreatmentSession('sess_integ_1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(sessionData);

    // Verify cache content
    const cached = queryClient.getQueryData(kinesiologyQueryKeys.session('sess_integ_1'));
    expect(cached).toEqual(sessionData);
  });

  it('executes startSession mutation, confirms server response, and updates cache without optimistic hazards', async () => {
    const initialSession = {
      id: 'sess_integ_2',
      clientId: 'client_alpha',
      appointmentId: 'appt_2',
      therapistId: 'therapist_1',
      status: 'SCHEDULED' as const,
      notes: {},
      version: 1,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };

    const updatedSession = {
      ...initialSession,
      status: 'IN_PROGRESS' as const,
      version: 2,
      updatedAt: '2026-08-17T10:05:00.000Z',
    };

    mockKinesiologyApi.startSession.mockResolvedValueOnce(updatedSession);

    const wrapper = createWrapper();
    queryClient.setQueryData(kinesiologyQueryKeys.session('sess_integ_2'), initialSession);

    const { result } = renderHook(() => useTreatmentMutations('sess_integ_2'), {
      wrapper,
    });

    await act(async () => {
      await result.current.startSession.mutateAsync();
    });

    // Authoritative confirmation verifies query data was updated
    const cached = queryClient.getQueryData(kinesiologyQueryKeys.session('sess_integ_2'));
    expect(cached).toEqual(updatedSession);
  });

  it('executes completeSession mutation and invalidates session, history, and timeline queries', async () => {
    const completedSession = {
      id: 'sess_integ_3',
      clientId: 'client_gamma',
      appointmentId: 'appt_3',
      therapistId: 'therapist_1',
      status: 'COMPLETED' as const,
      notes: { subjective: 'Resolved' },
      version: 3,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T11:00:00.000Z',
    };

    mockKinesiologyApi.completeSession.mockResolvedValueOnce(completedSession);

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTreatmentMutations('sess_integ_3'), {
      wrapper,
    });

    await act(async () => {
      await result.current.completeSession.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: kinesiologyQueryKeys.sessions(),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: kinesiologyQueryKeys.history('client_gamma'),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['timeline', 'client_gamma'],
      }),
    );
  });
});

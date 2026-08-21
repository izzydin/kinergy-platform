import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { notificationService } from '../../../app/providers/notification-provider';
import { RequestCanceledError, ServerError, ValidationError } from '../api-error';
import { useStandardMutation } from '../mutation-pipeline';

describe('Step A6.7 — Standard Mutation Pipeline', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  beforeEach(() => {
    act(() => {
      notificationService.clearAll();
    });
  });

  describe('1. Successful Mutation Execution', () => {
    it('executes mutationFn and returns data', async () => {
      const mockApi = jest.fn().mockResolvedValue({ id: 'client_1', name: 'Acme Corp' });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockApi,
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ id: 'client_1', name: 'Acme Corp' });
      expect(mockApi).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Mutation Error Normalization', () => {
    it('normalizes errors thrown by mutationFn', async () => {
      const rawError = new Error('Raw server crash');
      const mockApi = jest.fn().mockRejectedValue(rawError);

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockApi,
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(ServerError);
    });
  });

  describe('3. Cache Invalidation Strategy', () => {
    it('invalidates target query keys upon successful mutation', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['clients', 'list'], [{ id: 'c1' }]);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const mockApi = jest.fn().mockResolvedValue({ id: 'c2' });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockApi,
            invalidates: [['clients', 'list']],
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients', 'list'] });
    });
  });

  describe('4. Direct Cache Update (setQueryData)', () => {
    it('allows updating query cache in onSuccess callback', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['client', 'c1'], { id: 'c1', name: 'Old Name' });

      const mockApi = jest.fn().mockResolvedValue({ id: 'c1', name: 'New Name' });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockApi,
            onSuccess: (data) => {
              queryClient.setQueryData(['client', 'c1'], data);
            },
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(queryClient.getQueryData(['client', 'c1'])).toEqual({
        id: 'c1',
        name: 'New Name',
      });
    });
  });

  describe('5. Opt-in Optimistic Updates', () => {
    it('optimistically mutates cache data during onMutate', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['energy', 'metrics'], { count: 10 });

      let resolveApi!: (val: { count: 11 }) => void;
      const pendingApi = new Promise<{ count: 11 }>((res) => {
        resolveApi = res;
      });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: () => pendingApi,
            optimistic: {
              queryKey: ['energy', 'metrics'],
              update: (current: unknown) => ({
                count:
                  current && typeof current === 'object' && 'count' in current
                    ? (current as { count: number }).count + 1
                    : 1,
              }),
            },
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      // Verify cache was updated optimistically BEFORE promise resolves
      await waitFor(() =>
        expect(queryClient.getQueryData(['energy', 'metrics'])).toEqual({ count: 11 }),
      );

      act(() => {
        resolveApi({ count: 11 });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('6. Automatic Rollback on Optimistic Failure', () => {
    it('rolls back cache to previous snapshot when optimistic mutation fails', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['settings', 'profile'], { theme: 'dark' });

      let rejectApi!: (err: Error) => void;
      const pendingFailure = new Promise((_, rej) => {
        rejectApi = rej;
      });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: () => pendingFailure,
            optimistic: {
              queryKey: ['settings', 'profile'],
              update: () => ({ theme: 'light' }),
            },
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      // Initially updated to light optimistically
      await waitFor(() =>
        expect(queryClient.getQueryData(['settings', 'profile'])).toEqual({ theme: 'light' }),
      );

      act(() => {
        rejectApi(new Error('Update failed'));
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Rolled back to original snapshot
      expect(queryClient.getQueryData(['settings', 'profile'])).toEqual({ theme: 'dark' });
    });
  });

  describe('7. Error Notification Dispatching', () => {
    it('dispatches error toast via notificationService on mutation failure', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      const mockFailure = jest
        .fn()
        .mockRejectedValue(new ValidationError('Invalid Input', { field: ['Required'] }));

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockFailure,
            notifications: {
              error: 'Failed to Save Form',
            },
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADD',
          notification: expect.objectContaining({
            type: 'error',
            title: 'Failed to Save Form',
          }),
        }),
      );

      unsubscribe();
    });
  });

  describe('8. Success Notification Dispatching', () => {
    it('dispatches success toast via notificationService on mutation resolution', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      const mockSuccess = jest.fn().mockResolvedValue({ id: 'item_1' });

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockSuccess,
            notifications: {
              success: 'Item Saved Successfully',
            },
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADD',
          notification: expect.objectContaining({
            type: 'success',
            title: 'Item Saved Successfully',
          }),
        }),
      );

      unsubscribe();
    });
  });

  describe('9. Cancellation Handling', () => {
    it('suppresses error toast notifications on RequestCanceledError', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      const mockCanceled = jest.fn().mockRejectedValue(new RequestCanceledError());

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockCanceled,
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Zero notification toasts dispatched for cancellation
      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('10. Concurrent Mutations', () => {
    it('handles multiple parallel mutation executions cleanly', async () => {
      const mockApi = jest.fn().mockImplementation((val: number) => Promise.resolve(val * 2));

      const { result } = renderHook(
        () =>
          useStandardMutation<number, number>({
            mutationFn: mockApi,
          }),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.mutate(5);
        result.current.mutate(10);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApi).toHaveBeenCalledWith(5);
      expect(mockApi).toHaveBeenCalledWith(10);
    });
  });

  describe('11. Recovery After Rollback', () => {
    it('allows caller onError handler to perform additional recovery after rollback', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['client', 'c1'], { name: 'Original' });
      const onErrorCallback = jest.fn();

      const mockFailure = jest.fn().mockRejectedValue(new Error('Server Error'));

      const { result } = renderHook(
        () =>
          useStandardMutation({
            mutationFn: mockFailure,
            optimistic: {
              queryKey: ['client', 'c1'],
              update: () => ({ name: 'Optimistic' }),
            },
            onError: onErrorCallback,
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate(undefined);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Verify rollback executed first
      expect(queryClient.getQueryData(['client', 'c1'])).toEqual({ name: 'Original' });

      // Verify custom recovery handler executed second
      expect(onErrorCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('12. Query Cancellation During onMutate', () => {
    it('cancels outgoing queries for the target key before applying optimistic update', async () => {
      const wrapper = createWrapper();
      queryClient.setQueryData(['items', 'active'], [{ id: '1', active: true }]);
      const cancelSpy = jest.spyOn(queryClient, 'cancelQueries');

      const mockApi = jest.fn().mockResolvedValue({ id: '1', active: false });

      const { result } = renderHook(
        () =>
          useStandardMutation<
            { id: string; active: boolean },
            { id: string; active: boolean },
            ServerError,
            unknown,
            Array<{ id: string; active: boolean }>
          >({
            mutationFn: mockApi,
            optimistic: {
              queryKey: ['items', 'active'],
              update: (current = [], vars) =>
                current.map((item) =>
                  item.id === vars.id ? { ...item, active: vars.active } : item,
                ),
            },
          }),
        { wrapper },
      );

      act(() => {
        result.current.mutate({ id: '1', active: false });
      });

      expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ['items', 'active'] });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(queryClient.getQueryData(['items', 'active'])).toEqual([{ id: '1', active: false }]);
    });
  });
});
